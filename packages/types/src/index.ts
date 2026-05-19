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

/**
 * Civil-date YYYY-MM-DD string. Server casts to Postgres DATE; UI formats
 * for display via `formatDateOfBirth`. Empty string is treated as absent
 * by the API routes (translated to null before persisting).
 */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine(
    (s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d &&
        y >= 1900 &&
        y <= new Date().getUTCFullYear()
      );
    },
    { message: "Not a valid calendar date" },
  );

export const inviteClientInputSchema = UserInviteResultSchema.pick({
  email: true,
  fullName: true,
  phone: true,
}).extend({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(6).max(30).optional(),
  dateOfBirth: dateOfBirthSchema,
});
export type InviteClientInput = z.infer<typeof inviteClientInputSchema>;

export const updateClientInputSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().min(6).max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  // TODO(feat-birthday-gift worktree): tighten this so admins can't null out
  // a CLIENT's DOB — `getConsentStatus` throws on missing DOB, so nulling
  // here would silently break the consent gate for that client. Either drop
  // `.nullable()` entirely or 409 on { dateOfBirth: null } for CLIENT users.
  // Tracked in docs/superpowers/specs/2026-05-15-consent-deferred-followups.md
  // item #12.
  dateOfBirth: dateOfBirthSchema.nullable().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

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

export const BOOKING_ERRORS = {
  GUARDIAN_VERIFICATION_REQUIRED: "GUARDIAN_VERIFICATION_REQUIRED",
} as const;

export type BookingErrorCode =
  (typeof BOOKING_ERRORS)[keyof typeof BOOKING_ERRORS];

export const monthlyAvailabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});
export type MonthlyAvailabilityQuery = z.infer<
  typeof monthlyAvailabilityQuerySchema
>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
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

export const consentDocumentKeySchema = z.enum([
  "tos",
  "privacy",
  "eula",
  "waiver_adult",
  "waiver_minor",
  "social_media",
  "health_intake",
]);
export type ConsentDocumentKey = z.infer<typeof consentDocumentKeySchema>;

export const consentStatusPendingSchema = z.object({
  key: consentDocumentKeySchema,
  currentVersion: z.number().int().positive(),
  reason: z.enum(["missing", "outdated"]),
});

export const consentStatusResponseSchema = z.object({
  success: z.literal(true),
  pending: z.array(consentStatusPendingSchema),
  guardianVerificationNeeded: z.boolean(),
  socialMediaDecided: z.boolean(),
  socialMediaLatestAccepted: z.boolean().nullable(),
});
export type ConsentStatusResponse = z.infer<typeof consentStatusResponseSchema>;

export const consentAcceptInputSchema = z
  .object({
    documentKey: consentDocumentKeySchema,
    version: z.number().int().positive(),
    locale: z.enum(["sr", "en"]),
    guardianName: z.string().min(1).max(120).optional(),
    guardianRelation: z.enum(["parent", "legal_guardian"]).optional(),
  })
  .refine(
    (v) =>
      v.documentKey !== "waiver_minor" ||
      (typeof v.guardianName === "string" &&
        v.guardianName.length > 0 &&
        v.guardianRelation !== undefined),
    {
      message:
        "guardianName and guardianRelation are required for waiver_minor",
      path: ["guardianName"],
    },
  );
export type ConsentAcceptInput = z.infer<typeof consentAcceptInputSchema>;

export const socialMediaConsentInputSchema = z.object({
  accepted: z.boolean(),
});
export type SocialMediaConsentInput = z.infer<typeof socialMediaConsentInputSchema>;

export const healthIntakeInputSchema = z
  .object({
    isPhysicallyActive: z.boolean(),
    isFirstPilates: z.boolean(),
    hasComplaints: z.boolean(),
    complaintsDetails: z.string().min(1).max(2000).optional(),
    hasInjuries: z.boolean(),
    injuriesDetails: z.string().min(1).max(2000).optional(),
    isPregnant: z.boolean(),
    isPostpartum: z.boolean(),
    guardianName: z.string().min(1).max(120).optional(),
    guardianRelation: z.enum(["roditelj", "staratelj"]).optional(),
  })
  .refine((d) => !d.hasComplaints || (d.complaintsDetails?.trim().length ?? 0) > 0, {
    message: "complaintsDetails required when hasComplaints is true",
    path: ["complaintsDetails"],
  })
  .refine((d) => !d.hasInjuries || (d.injuriesDetails?.trim().length ?? 0) > 0, {
    message: "injuriesDetails required when hasInjuries is true",
    path: ["injuriesDetails"],
  });
export type HealthIntakeInput = z.infer<typeof healthIntakeInputSchema>;

export const healthIntakeResponseSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  isPhysicallyActive: z.boolean(),
  isFirstPilates: z.boolean(),
  hasComplaints: z.boolean(),
  complaintsDetails: z.string().nullable(),
  hasInjuries: z.boolean(),
  injuriesDetails: z.string().nullable(),
  isPregnant: z.boolean(),
  isPostpartum: z.boolean(),
  recordedAt: z.string(), // ISO date string when JSON-serialized
  recordedByUserId: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianRelation: z.string().nullable(),
});
export type HealthIntakeResponse = z.infer<typeof healthIntakeResponseSchema>;

export const legalDocumentResponseSchema = z.object({
  success: z.literal(true),
  key: consentDocumentKeySchema,
  version: z.number().int().positive(),
  locale: z.enum(["sr", "en"]),
  body: z.string(),
});
export type LegalDocumentResponse = z.infer<typeof legalDocumentResponseSchema>;

export const legalDocumentsListResponseSchema = z.object({
  success: z.literal(true),
  documents: z.array(
    z.object({
      key: consentDocumentKeySchema,
      version: z.number().int().positive(),
      locale: z.enum(["sr", "en"]),
    }),
  ),
});
export type LegalDocumentsListResponse = z.infer<
  typeof legalDocumentsListResponseSchema
>;

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
  capacity: true,
}).extend({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  classTypeName: z.string(),
  roomId: z.nullable(z.string()).optional(),
  roomName: z.nullable(z.string()),
  trainerUserId: z.nullable(z.string()).optional(),
  trainerName: z.nullable(z.string()).optional(),
  bookedCount: z.number(),
  waitlistCount: z.number(),
  availableSlots: z.number(),
  recurringScheduleId: z.nullable(z.string()).optional(),
  isActive: z.boolean().optional(),
  isBookedByMe: z.boolean().optional(),
  lateCancelHours: z.nullable(z.number()).optional(),
});
export type AvailabilitySession = z.infer<typeof availabilitySessionSchema>;

export const availabilityResponseSchema = z.object({
  success: z.boolean(),
  month: z.string(),
  sessions: z.array(availabilitySessionSchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const clientPackageStatusSchema = z.enum([
  "active",
  "expiring",
  "paused",
  "expired",
  "none",
]);
export type ClientPackageStatus = z.infer<typeof clientPackageStatusSchema>;

export const clientsResponseSchema = z.object({
  success: z.boolean(),
  clients: z.array(
    z.object({
      id: z.string(),
      notes: z.optional(z.nullable(z.string())),
      packageStatus: clientPackageStatusSchema,
      user: z.object({
        id: z.string(),
        fullName: z.string(),
        email: z.email(),
        phone: z.optional(z.nullable(z.string())),
      }),
    }),
  ),
  // Cursor-based pagination: opaque string (clientProfile.id) of the last
  // row on this page, or null when this is the final page. Optional in
  // the response shape so older non-paginated callers (and the existing
  // integration tests that assert specific badge content) still type-check.
  nextCursor: z.nullable(z.string()).optional(),
});
export type ClientsResponse = z.infer<typeof clientsResponseSchema>;

export const clientByIdResponseSchema = z.object({
  success: z.boolean(),
  client: z.object({
    id: z.string(),
    notes: z.nullable(z.string()),
    dateOfBirth: z.nullable(z.string()),
    packageStatus: clientPackageStatusSchema,
    user: z.object({
      id: z.string(),
      fullName: z.string(),
      email: z.email(),
      phone: z.nullable(z.string()),
      isActive: z.boolean(),
    }),
  }),
});
export type ClientByIdResponse = z.infer<typeof clientByIdResponseSchema>;

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
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
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
  trainerUserId: z.uuid(),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  capacity: z.number().int().positive(),
  isActive: z.boolean().default(true),
});
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const updateSessionInputSchema = z.object({
  startsAt: z.string().min(10).optional(),
  endsAt: z.string().min(10).optional(),
  capacity: z.number().int().positive().optional(),
  roomId: z.uuid().nullable().optional(),
  trainerUserId: z.uuid().optional(),
  isActive: z.boolean().optional(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]).optional(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

export const createRecurringSessionsInputSchema = z.object({
  classTypeId: z.uuid(),
  roomId: z.uuid().optional(),
  trainerUserId: z.uuid(),
  startsAt: z.string().min(10),
  durationMins: z.number().int().positive(),
  capacity: z.number().int().positive(),
  weekCount: z.number().int().min(1).max(52),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  isActive: z.boolean().default(true),
});
export type CreateRecurringSessionsInput = z.infer<
  typeof createRecurringSessionsInputSchema
>;

export const updateRecurringSeriesInputSchema = z.object({
  roomId: z.uuid().nullable().optional(),
  trainerUserId: z.uuid().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  /** Minutes from start-of-day, 0..1439 */
  timeOfDayMins: z.number().int().min(0).max(1439).optional(),
  durationMins: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  /** Replace the future-occurrence horizon with this many weeks from today. */
  weekCount: z.number().int().min(1).max(52).optional(),
});
export type UpdateRecurringSeriesInput = z.infer<
  typeof updateRecurringSeriesInputSchema
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
  notes: true,
}).extend({
  amount: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  status: z.enum(["CONFIRMED"]).optional(),
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
  classTypeId: z.uuid(),
  isBirthdayGift: z.boolean().optional().default(false),
}).refine(
  (data) => !data.isBirthdayGift || data.sessionCount === 1,
  {
    message: "Birthday gift PackageTypes must have sessionCount = 1",
    path: ["sessionCount"],
  },
);
export type PackageTypeInput = z.infer<typeof packageTypeInputSchema>;

export const updatePackageTypeInputSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  sessionCount: z.number().int().positive().optional(),
  validityDays: z.number().int().positive().optional(),
  lateCancelHours: z.number().int().nonnegative().optional(),
  classTypeId: z.uuid().optional(),
  isBirthdayGift: z.boolean().optional(),
}).refine(
  (data) =>
    !data.isBirthdayGift || data.sessionCount === undefined || data.sessionCount === 1,
  {
    message: "Birthday gift PackageTypes must have sessionCount = 1",
    path: ["sessionCount"],
  },
);
export type UpdatePackageTypeInput = z.infer<typeof updatePackageTypeInputSchema>;

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

export const updateStudioRoomInputSchema = studioRoomInputSchema.partial();
export type UpdateStudioRoomInput = z.infer<typeof updateStudioRoomInputSchema>;

export const updateClassTypeInputSchema = classTypeInputSchema.partial();
export type UpdateClassTypeInput = z.infer<typeof updateClassTypeInputSchema>;

export const updateTrainerNoteInputSchema = z.object({
  note: z.string().min(1).max(500),
});
export type UpdateTrainerNoteInput = z.infer<typeof updateTrainerNoteInputSchema>;

export const appThemeTokens = {
  background: "#fdf7f4",
  brand: "#2e5b42",
  accent: "#6e1644",
} as const;

