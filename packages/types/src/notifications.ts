import { z } from "zod";
import { AppLocaleSchema } from "./generated/prisma-zod/schemas/enums/AppLocale.schema";
import { NotificationTypeSchema } from "./generated/prisma-zod/schemas/enums/NotificationType.schema";

export const notificationTypeSchema = NotificationTypeSchema;
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const registerPushTokenInputSchema = z.object({
  deviceId: z.string().min(1).max(120),
  expoPushToken: z
    .string()
    .regex(
      /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/,
      "Invalid Expo push token",
    ),
  preferredLocale: AppLocaleSchema.optional(),
});
export type RegisterPushTokenInput = z.infer<
  typeof registerPushTokenInputSchema
>;

export const notificationPreferenceInputSchema = z.object({
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  campaignsEnabled: z.boolean().optional(),
  bookingEmailsEnabled: z.boolean().optional(),
  preferredLocale: AppLocaleSchema.optional().nullable(),
});
export type NotificationPreferenceInput = z.infer<
  typeof notificationPreferenceInputSchema
>;

export const createNotificationInputSchema = z.object({
  userId: z.uuid(),
  type: notificationTypeSchema.default("GENERAL"),
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type CreateNotificationInput = z.infer<
  typeof createNotificationInputSchema
>;

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
export type CreateNotificationResponse = z.infer<
  typeof createNotificationResponseSchema
>;

// PATCH /api/notifications — bulk mark-as-read; count of rows flipped.
export const batchMarkNotificationsReadResponseSchema = z.object({
  success: z.boolean(),
  count: z.number(),
});
export type BatchMarkNotificationsReadResponse = z.infer<
  typeof batchMarkNotificationsReadResponseSchema
>;

// PATCH /api/notifications/[id] — single mark-as-read. `readAt` is always
// set on the way out (idempotent PATCH keeps the original read instant).
export const markNotificationReadResponseSchema = z.object({
  success: z.boolean(),
  notification: z.object({
    id: z.string(),
    readAt: z.string(),
  }),
});
export type MarkNotificationReadResponse = z.infer<
  typeof markNotificationReadResponseSchema
>;

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
export type RegisterPushTokenResponse = z.infer<
  typeof registerPushTokenResponseSchema
>;

// DELETE /api/notifications/push-token — number of tokens deactivated.
export const unregisterPushTokenResponseSchema = z.object({
  success: z.boolean(),
  deactivated: z.number(),
});
export type UnregisterPushTokenResponse = z.infer<
  typeof unregisterPushTokenResponseSchema
>;
