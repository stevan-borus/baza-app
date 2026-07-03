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
