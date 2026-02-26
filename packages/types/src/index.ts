import { z } from "zod";
import { UserRoleSchema } from "./generated/prisma-zod/schemas/enums/UserRole.schema";
import { BillingRecordInputSchema } from "./generated/prisma-zod/schemas/variants/input/BillingRecord.input";
import { ClassTypeInputSchema } from "./generated/prisma-zod/schemas/variants/input/ClassType.input";
import { ClientPackageInputSchema } from "./generated/prisma-zod/schemas/variants/input/ClientPackage.input";
import { PackagePauseInputSchema } from "./generated/prisma-zod/schemas/variants/input/PackagePause.input";
import { PackageTypeInputSchema } from "./generated/prisma-zod/schemas/variants/input/PackageType.input";
import { StudioRoomInputSchema } from "./generated/prisma-zod/schemas/variants/input/StudioRoom.input";
import { SessionResultSchema } from "./generated/prisma-zod/schemas/variants/result/Session.result";
import { UserInviteResultSchema } from "./generated/prisma-zod/schemas/variants/result/UserInvite.result";
import { AppLocaleSchema } from "./generated/prisma-zod/schemas/enums/AppLocale.schema";
import { NotificationTypeSchema } from "./generated/prisma-zod/schemas/enums/NotificationType.schema";

export const roleSchema = UserRoleSchema;
export type Role = z.infer<typeof roleSchema>;

export const inviteClientInputSchema = UserInviteResultSchema.pick({
  email: true,
  fullName: true,
  phone: true,
}).extend({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(6).max(30).optional(),
});
export type InviteClientInput = z.infer<typeof inviteClientInputSchema>;

export const completeInviteInputSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(6).max(128),
});
export type CompleteInviteInput = z.infer<typeof completeInviteInputSchema>;

export const requestPasswordResetInputSchema = z.object({
  email: z.email(),
});
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetInputSchema
>;

export const signInInputSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(128),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

export const resetPasswordInputSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(6).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const bookingActionSchema = z.enum(["BOOK", "CANCEL"]);

export const bookingMutationInputSchema = z.object({
  sessionId: z.uuid(),
  action: bookingActionSchema,
});
export type BookingMutationInput = z.infer<typeof bookingMutationInputSchema>;

export const bookingMutationResultSchema = z.object({
  success: z.boolean(),
  state: z.enum([
    "BOOKED",
    "BOOKED_ALREADY",
    "WAITLISTED",
    "WAITLIST_PROMOTED",
    "CANCELED",
  ]),
});
export type BookingMutationResult = z.infer<typeof bookingMutationResultSchema>;

export const monthlyAvailabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});
export type MonthlyAvailabilityQuery = z.infer<
  typeof monthlyAvailabilityQuerySchema
>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  clientProfile: z.object({ id: z.string() }).nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authMeResponseSchema = z.object({
  success: z.boolean(),
  user: sessionUserSchema,
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const signInResponseSchema = z.object({
  token: z.optional(z.string()),
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

export const availabilitySessionSchema = SessionResultSchema.pick({
  id: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
}).extend({
  classTypeName: z.string(),
  roomName: z.nullable(z.string()),
  bookedCount: z.number(),
  waitlistCount: z.number(),
  availableSlots: z.number(),
});
export type AvailabilitySession = z.infer<typeof availabilitySessionSchema>;

export const availabilityResponseSchema = z.object({
  success: z.boolean(),
  month: z.string(),
  sessions: z.array(availabilitySessionSchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const clientsResponseSchema = z.object({
  success: z.boolean(),
  clients: z.array(
    z.object({
      id: z.string(),
      notes: z.optional(z.nullable(z.string())),
      user: z.object({
        id: z.string(),
        fullName: z.string(),
        email: z.email(),
        phone: z.optional(z.nullable(z.string())),
      }),
    }),
  ),
});
export type ClientsResponse = z.infer<typeof clientsResponseSchema>;

export const reportsSummaryResponseSchema = z.object({
  success: z.boolean(),
  summary: z.object({
    totalClients: z.number(),
    activeClients: z.number(),
    inactiveClients: z.number(),
    totalSessions: z.number(),
    revenue: z.number(),
    totalPayments: z.number(),
  }),
});
export type ReportsSummaryResponse = z.infer<
  typeof reportsSummaryResponseSchema
>;

export const reportsPeriodSchema = z.enum(["day", "week", "month"]);
export type ReportsPeriod = z.infer<typeof reportsPeriodSchema>;

export const reportsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: reportsPeriodSchema.default("day"),
  includeDeltas: z.coerce.boolean().default(false),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const packagePauseInputSchema = PackagePauseInputSchema.pick({
  clientProfileId: true,
  startsAt: true,
  endsAt: true,
  reason: true,
}).extend({
  reason: z.string().max(300).optional(),
});
export type PackagePauseInput = z.infer<typeof packagePauseInputSchema>;

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
  marketingOptIn: z.boolean().optional(),
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

export const trainerNoteInputSchema = z.object({
  sessionId: z.uuid(),
  clientProfileId: z.uuid(),
  note: z.string().min(1).max(500),
});
export type TrainerNoteInput = z.infer<typeof trainerNoteInputSchema>;

export const trainerNotesQuerySchema = z.object({
  sessionId: z.uuid().optional(),
  clientProfileId: z.uuid().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});
export type TrainerNotesQuery = z.infer<typeof trainerNotesQuerySchema>;

export const createSessionInputSchema = z.object({
  classTypeId: z.uuid(),
  roomId: z.uuid().optional(),
  trainerUserId: z.uuid().optional(),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  capacity: z.number().int().positive(),
});
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const updateSessionInputSchema = z.object({
  startsAt: z.string().min(10).optional(),
  endsAt: z.string().min(10).optional(),
  capacity: z.number().int().positive().optional(),
  roomId: z.uuid().nullable().optional(),
  trainerUserId: z.uuid().nullable().optional(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]).optional(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

export const createRecurringSessionsInputSchema = z.object({
  classTypeId: z.uuid(),
  roomId: z.uuid().optional(),
  trainerUserId: z.uuid().optional(),
  startsAt: z.string().min(10),
  durationMins: z.number().int().positive(),
  capacity: z.number().int().positive(),
  repeatCount: z.number().int().min(1).max(52),
  repeatEveryDays: z.number().int().min(1).max(30).default(7),
});
export type CreateRecurringSessionsInput = z.infer<
  typeof createRecurringSessionsInputSchema
>;

export const createPromotionCampaignInputSchema = z.object({
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePromotionCampaignInput = z.infer<
  typeof createPromotionCampaignInputSchema
>;

export const billingRecordInputSchema = BillingRecordInputSchema.pick({
  clientUserId: true,
  amount: true,
  method: true,
  status: true,
  notes: true,
}).extend({
  amount: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  packageTypeId: z.uuid().optional(),
  activatePackageOnConfirm: z.boolean().default(true),
});
export type BillingRecordInput = z.infer<typeof billingRecordInputSchema>;

export const packageTypeInputSchema = PackageTypeInputSchema.pick({
  name: true,
  sessionCount: true,
  validityDays: true,
  lateCancelHours: true,
}).extend({
  name: z.string().min(2).max(100),
  sessionCount: z.number().int().positive(),
  validityDays: z.number().int().positive(),
  lateCancelHours: z.number().int().nonnegative().default(12),
});
export type PackageTypeInput = z.infer<typeof packageTypeInputSchema>;

export const createClientPackageInputSchema = ClientPackageInputSchema.pick({
  clientProfileId: true,
  packageTypeId: true,
  startsAt: true,
}).extend({
  startsAt: z.string().min(10),
});
export type CreateClientPackageInput = z.infer<
  typeof createClientPackageInputSchema
>;

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const classTypeInputSchema = ClassTypeInputSchema.pick({
  name: true,
  maxClients: true,
  durationMins: true,
}).extend({
  name: z.string().min(2).max(100),
  maxClients: z.number().int().positive(),
  durationMins: z.number().int().positive(),
});
export type ClassTypeInput = z.infer<typeof classTypeInputSchema>;

export const studioRoomInputSchema = StudioRoomInputSchema.pick({
  name: true,
  capacity: true,
}).extend({
  name: z.string().min(2).max(100),
  capacity: z.number().int().positive(),
});
export type StudioRoomInput = z.infer<typeof studioRoomInputSchema>;

export const appThemeTokens = {
  background: "#fdf7f4",
  brand: "#2e5b42",
  accent: "#6e1644",
} as const;

