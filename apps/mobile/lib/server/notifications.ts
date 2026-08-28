/**
 * In-app and push notifications. Expo for push; dedupe via notificationKey for cron jobs.
 */
import {
  getNotificationMessage,
  NOTIFICATION_MESSAGE_I18N_KEYS,
  resolveLocale,
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
  return resolveLocale(pref?.preferredLocale);
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
 * Expo's per-ticket `details.error` for a token that no longer belongs to a
 * live install (app uninstalled, or the token was invalidated). It is the only
 * error that means "stop using this token" — every other one (rate limits,
 * credential problems, message-too-big) is either transient or about the
 * message, so deactivating on those would silently un-enroll healthy devices.
 */
const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

type ExpoTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

type PushDispatchResult = {
  sent: boolean;
  status: string;
  /** Tokens Expo says are dead — the caller flips these to isActive: false. */
  deadTokens: string[];
};

/**
 * Sends push notifications to Expo and returns a per-token delivery state.
 *
 * Expo answers with one ticket per message, in request order, so the ticket at
 * index i belongs to expoPushTokens[i]. Delivery status reflects that reality:
 * a mixed batch used to record a flat DELIVERED as long as ANY device
 * succeeded, which hid the fact that others got nothing.
 */
async function sendExpoPushNotifications(
  expoPushTokens: string[],
  title: string,
  body: string,
  payload: Record<string, unknown> | undefined,
  type: NotificationType,
  badge: number,
): Promise<PushDispatchResult> {
  if (expoPushTokens.length === 0) {
    return { sent: false, status: "NO_ACTIVE_PUSH_TOKENS", deadTokens: [] };
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
    return { sent: false, status: "EXPO_NETWORK_ERROR", deadTokens: [] };
  }

  const response = fetchResult.data;
  if (!response.ok) {
    return {
      sent: false,
      status: `EXPO_HTTP_${response.status}`,
      deadTokens: [],
    };
  }

  const jsonResult = await tryCatch(response.json());
  const json = jsonResult.error
    ? null
    : (jsonResult.data as { data?: ExpoTicket[] } | null);
  const tickets = json?.data ?? [];

  if (tickets.length === 0) {
    return { sent: false, status: "EXPO_NO_TICKETS", deadTokens: [] };
  }

  const deadTokens: string[] = [];
  const errorReasons: string[] = [];
  let okCount = 0;

  tickets.forEach((ticket, index) => {
    // Tickets come back positionally, so index maps to the token we sent.
    const token = expoPushTokens[index];
    if (ticket?.status === "ok") {
      okCount += 1;
      return;
    }
    const reason = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN";
    errorReasons.push(reason);
    if (token && ticket?.details?.error === DEVICE_NOT_REGISTERED) {
      deadTokens.push(token);
    }
  });

  const total = tickets.length;
  if (okCount === total) {
    return { sent: true, status: "DELIVERED", deadTokens };
  }

  // Keep the concrete Expo reason(s) — the old opaque "FAILED" made it
  // impossible to tell a dead device from bad FCM credentials. Deduped so a
  // large batch failing the same way doesn't blow up the column.
  const uniqueReasons = [...new Set(errorReasons)].join(",");
  if (okCount === 0) {
    return { sent: false, status: `FAILED:${uniqueReasons}`, deadTokens };
  }
  return {
    sent: true,
    status: `PARTIAL:${okCount}/${total}:${uniqueReasons}`,
    deadTokens,
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

      // Retire tokens Expo reported as dead so they stop being retried on
      // every future notification (and stop dragging the batch into PARTIAL).
      if (result.deadTokens.length > 0) {
        await prisma.pushToken.updateMany({
          where: { expoPushToken: { in: result.deadTokens } },
          data: { isActive: false },
        });
      }

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
    // Best-effort status write. This is fire-and-forget at the call site
    // (`void notifyClient(...)`), so it must NEVER reject: if the log row was
    // deleted mid-dispatch (a concurrent reset/cleanup — which the e2e stack
    // does), the update throws P2025 and, unhandled, crashes the whole server
    // process. Swallow it and fall back to the in-memory log so callers still
    // get a value.
    const recorded = await tryCatch(
      prisma.notificationLog.update({
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
      }),
    );
    return recorded.data ?? log;
  }

  // The happy-path update (inside the tryCatch above) can likewise P2025 if the
  // row vanished mid-dispatch; tryCatch already caught it, so fall back to the
  // in-memory log rather than returning undefined.
  return dispatchResult.data ?? log;
}
