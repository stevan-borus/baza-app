/**
 * In-app and push notifications. Expo for push; dedupe via notificationKey for cron jobs.
 */
import {
  getNotificationMessage,
  NOTIFICATION_MESSAGE_I18N_KEYS,
  type NotificationLocale,
  type NotificationMessageKey,
} from "@baza/i18n";
import { NotificationType, Prisma } from "@/generated/prisma";
import { env } from "@/lib/server/env";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

/**
 * Returns the user's preferred notification locale; defaults to "sr" when not set.
 */
export async function getPreferredLocale(userId: string): Promise<NotificationLocale> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { preferredLocale: true },
  });
  return pref?.preferredLocale === "en" ? "en" : "sr";
}

/**
 * Creates and dispatches a system notification using shared message copy and the user's preferred locale.
 * Stores messageKey in payload so the mobile app can show in-app text via t(messageKey.title/body).
 */
export async function createSystemNotification(
  userId: string,
  messageKey: NotificationMessageKey,
  type: NotificationType,
  payload: Record<string, unknown>,
  options?: { dedupeKey?: string; skipPush?: boolean },
) {
  const locale = await getPreferredLocale(userId);
  // Pass the payload as interpolation vars so server-rendered notification
  // copy can mention the client by name (e.g. BIRTHDAY_ADMIN_PROMPT). Only
  // scalar payload values are usable; nested objects are dropped silently
  // by the interpolator (regex matches `\w+` keys only).
  const interpVars: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string" || typeof v === "number") interpVars[k] = v;
  }
  const { title, body } = getNotificationMessage(messageKey, locale, interpVars);
  const messageI18nKey = NOTIFICATION_MESSAGE_I18N_KEYS[messageKey];
  return createAndDispatchUserNotification({
    userId,
    type,
    title,
    body,
    payload: { ...payload, messageKey: messageI18nKey },
    dedupeKey: options?.dedupeKey,
    skipPush: options?.skipPush,
  });
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  /**
   * When true, persist the NotificationLog but skip the Expo push dispatch.
   * Used for low-priority alerts (e.g., routine early cancellations) where
   * we want in-app visibility without a phone buzz.
   */
  skipPush?: boolean;
  /** Links this log to the Campaign it was dispatched from (history + audit). */
  campaignId?: string;
};

/**
 * Sends push notifications to Expo and returns a simplified delivery state.
 */
async function sendExpoPushNotifications(
  expoPushTokens: string[],
  title: string,
  body: string,
  payload: Record<string, unknown> | undefined,
  type: NotificationType,
  badge: number,
) {
  if (expoPushTokens.length === 0) {
    return { sent: false, status: "NO_ACTIVE_PUSH_TOKENS" };
  }

  // `__notificationType` lets the mobile push-tap handler route without a
  // separate API call. The double-underscore prefix avoids collision with
  // any user-controlled payload key.
  const data = { ...(payload ?? {}), __notificationType: type };

  const fetchResult = await tryCatch(
    fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        expoPushTokens.map((to) => ({
          to,
          title,
          body,
          data,
          sound: "default",
          badge,
        })),
      ),
    }),
  );

  if (fetchResult.error) {
    return { sent: false, status: "EXPO_NETWORK_ERROR" };
  }

  const response = fetchResult.data;
  if (!response.ok) {
    return {
      sent: false,
      status: `EXPO_HTTP_${response.status}`,
    };
  }

  const jsonResult = await tryCatch(response.json());
  const json = jsonResult.error
    ? null
    : (jsonResult.data as { data?: Array<{ status?: string }> } | null);
  const tickets = json?.data ?? [];
  const sent = tickets.some((ticket) => ticket.status === "ok");
  return {
    sent,
    status: sent ? "DELIVERED" : "FAILED",
  };
}

/**
 * Persists notification state and optionally dispatches push delivery.
 *
 * Uses `dedupeKey` to avoid duplicate records for scheduled jobs.
 */
export async function createAndDispatchUserNotification(input: NotificationPayload) {
  const jsonPayload =
    input.payload === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue);

  const preference = await prisma.notificationPreference.upsert({
    where: { userId: input.userId },
    update: {},
    create: { userId: input.userId },
    select: {
      pushEnabled: true,
      inAppEnabled: true,
    },
  });

  if (input.dedupeKey) {
    // Scheduled jobs can safely retry because they resolve to one log row.
    const existing = await prisma.notificationLog.findUnique({
      where: { notificationKey: input.dedupeKey },
      select: { id: true },
    });
    if (existing) {
      return prisma.notificationLog.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          payload: true,
          pushSent: true,
          pushStatus: true,
          readAt: true,
          createdAt: true,
        },
      });
    }
  }

  const log = await prisma.notificationLog.create({
    data: {
      userId: input.userId,
      notificationKey: input.dedupeKey,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: jsonPayload,
      campaignId: input.campaignId,
    },
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      payload: true,
      pushSent: true,
      pushStatus: true,
      readAt: true,
      createdAt: true,
    },
  });

  if (!preference.pushEnabled || input.skipPush) {
    // Keep in-app history when push is disabled OR explicitly silenced.
    return log;
  }

  const dispatchResult = await tryCatch(
    (async () => {
      const [tokens, unreadCount] = await Promise.all([
        prisma.pushToken.findMany({
          where: { userId: input.userId, isActive: true },
          select: { expoPushToken: true },
        }),
        // Includes the row just created above (readAt is null), so this
        // gives the iOS-correct "post-delivery" badge.
        prisma.notificationLog.count({
          where: { userId: input.userId, readAt: null },
        }),
      ]);
      const result = await sendExpoPushNotifications(
        tokens.map((token: { expoPushToken: string }) => token.expoPushToken),
        input.title,
        input.body,
        input.payload,
        input.type,
        unreadCount,
      );
      return prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          pushSent: result.sent,
          pushStatus: result.status,
        },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          payload: true,
          pushSent: true,
          pushStatus: true,
          readAt: true,
          createdAt: true,
        },
      });
    })(),
  );

  if (dispatchResult.error) {
    return prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        pushSent: false,
        pushStatus: "DISPATCH_ERROR",
      },
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        pushSent: true,
        pushStatus: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  return dispatchResult.data;
}
