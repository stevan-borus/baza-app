import { z } from "zod";

// Mirrors the Prisma AppLocale enum.
const appLocaleSchema = z.enum(["sr", "en"]);

// Mirrors the Prisma NotificationType enum.
export const notificationTypeSchema = z.enum([
  "BOOKING_CONFIRMED",
  "SESSION_UPDATED",
  "TRAINER_NOTE",
  "GENERAL",
  "BOOKING_CANCELED_ADMIN",
  "BOOKING_CANCELED_TRAINER",
  "CONSENT_REFUSED",
  "MINOR_PAPER_NEEDED",
  "BIRTHDAY_ADMIN_PROMPT",
  "BIRTHDAY_CLIENT_GIFT",
  "RESERVATION_UNBACKED_ATTENDANCE",
  "BULK_RESERVATION_CANCEL_ADMIN",
  "BULK_RESERVATION_CANCEL_TRAINER",
  "CAMPAIGN",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const registerPushTokenInputSchema = z.object({
  deviceId: z.string().min(1).max(120),
  expoPushToken: z
    .string()
    .regex(
      /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/,
      "Invalid Expo push token",
    ),
  preferredLocale: appLocaleSchema.optional(),
});

export const notificationPreferenceInputSchema = z.object({
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  campaignsEnabled: z.boolean().optional(),
  bookingEmailsEnabled: z.boolean().optional(),
  preferredLocale: appLocaleSchema.optional().nullable(),
});

export const createNotificationInputSchema = z.object({
  userId: z.uuid(),
  type: notificationTypeSchema.default("GENERAL"),
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()).optional(),
});

// ─── Notification response schemas ───────────────────────────────────────────

const jsonValueSchema: z.ZodType<
  | string
  | number
  | boolean
  | null
  | Record<string, string | number | boolean | null>
  | Array<string | number | boolean | null>
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ]),
);

export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), jsonValueSchema).nullable().optional(),
  readAt: z.nullable(z.string()),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

// GET /api/notifications
export const notificationsResponseSchema = z.object({
  success: z.boolean(),
  notifications: z.array(notificationSchema),
  nextCursor: z.nullable(z.string()).optional(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

// POST /api/notifications — the NotificationLog row as created/dispatched.
// `payload` values are arbitrary JSON here (unlike the inbox schema above)
// because the input schema accepts z.unknown() record values.
export const createNotificationResponseSchema = z.object({
  success: z.boolean(),
  notification: z.object({
    id: z.string(),
    userId: z.string(),
    type: notificationTypeSchema,
    title: z.string(),
    body: z.string(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    pushSent: z.boolean(),
    pushStatus: z.string().nullable(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  }),
});

// PATCH /api/notifications — bulk mark-as-read; count of rows flipped.
export const batchMarkNotificationsReadResponseSchema = z.object({
  success: z.boolean(),
  count: z.number(),
});

// PATCH /api/notifications/[id] — single mark-as-read. `readAt` is always
// set on the way out (idempotent PATCH keeps the original read instant).
export const markNotificationReadResponseSchema = z.object({
  success: z.boolean(),
  notification: z.object({
    id: z.string(),
    readAt: z.string(),
  }),
});

export const notificationPreferencesSchema = z.object({
  pushEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  campaignsEnabled: z.boolean(),
  bookingEmailsEnabled: z.boolean(),
  preferredLocale: z.string().nullable().optional(),
});
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

// GET + PATCH /api/notifications/preferences
export const notificationPreferencesResponseSchema = z.object({
  success: z.boolean(),
  preferences: notificationPreferencesSchema,
});
export type NotificationPreferencesResponse = z.infer<
  typeof notificationPreferencesResponseSchema
>;

// POST /api/notifications/push-token — the PushToken row as upserted.
export const registerPushTokenResponseSchema = z.object({
  success: z.boolean(),
  token: z.object({
    id: z.string(),
    deviceId: z.string(),
    expoPushToken: z.string(),
    isActive: z.boolean(),
    lastSeenAt: z.string(),
  }),
});

// DELETE /api/notifications/push-token — number of tokens deactivated.
export const unregisterPushTokenResponseSchema = z.object({
  success: z.boolean(),
  deactivated: z.number(),
});
