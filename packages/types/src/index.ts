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

/** Display name derived from the normalized first/last fields. */
export function formatFullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

/**
 * The name to show for a user in the UI: their real full name, falling back
 * to the email local-part only when no name is on the record (e.g. an
 * incompletely-provisioned account). Single source for every "who is this"
 * label — profile header, settings sheet, greeting — so none of them silently
 * render the email instead of the name.
 */
export function displayName(
  user?: { firstName?: string | null; lastName?: string | null; email?: string | null },
): string {
  const full = formatFullName(user?.firstName ?? "", user?.lastName ?? "");
  if (full) return full;
  return user?.email?.split("@")[0] ?? "";
}

/**
 * A required person-name field. Trims surrounding whitespace *before* the
 * length check, so a whitespace-only input (e.g. "   ") is rejected rather
 * than stored — and a padded value ("  Ana  ") persists clean, keeping the
 * derived `fullName` free of stray/double spaces.
 */
export const nameFieldSchema = z.string().trim().min(1).max(50);

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
      // The regex above guarantees three numeric parts; the explicit
      // Number() calls keep that obvious to the type-checker under
      // noUncheckedIndexedAccess (a destructure would be `number | undefined`).
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(5, 7));
      const d = Number(s.slice(8, 10));
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
  firstName: true,
  lastName: true,
  phone: true,
}).extend({
  firstName: nameFieldSchema,
  lastName: nameFieldSchema,
  phone: z.string().min(6).max(30).optional(),
  dateOfBirth: dateOfBirthSchema,
});
export type InviteClientInput = z.infer<typeof inviteClientInputSchema>;

export const updateClientInputSchema = z.object({
  firstName: nameFieldSchema.optional(),
  lastName: nameFieldSchema.optional(),
  phone: z.string().min(6).max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  // TODO(feat-birthday-gift worktree): tighten this so admins can't null out
  // a CLIENT's DOB — `getConsentStatus` throws on missing DOB, so nulling
  // here would silently break the consent gate for that client. Either drop
  // `.nullable()` entirely or 409 on { dateOfBirth: null } for CLIENT users.
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
  SESSION_IN_PAST: "SESSION_IN_PAST",
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
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(), // derived server-side; kept for display sites
  role: UserRoleSchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
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

// Stable codes for the multi-select fields. Labels are localized in the app;
// the DB stores these codes so a translation change doesn't drop data.
export const healthConditionCodeSchema = z.enum([
  "neck_pain",
  "back_pain",
  "disc_herniation",
  "scoliosis",
  "joint_pain_injuries",
  "osteoporosis",
  "high_blood_pressure",
  "dizziness_balance",
  "recent_surgery",
  "pregnancy_postpartum",
]);
export type HealthConditionCode = z.infer<typeof healthConditionCodeSchema>;

export const pilatesExperienceCodeSchema = z.enum([
  "none",
  "mat",
  "reformer",
  "clinical",
]);
export type PilatesExperienceCode = z.infer<typeof pilatesExperienceCodeSchema>;

export const activityLevelCodeSchema = z.enum([
  "sedentary",
  "moderate",
  "high",
]);
export type ActivityLevelCode = z.infer<typeof activityLevelCodeSchema>;

export const exerciseFrequencyCodeSchema = z.enum(["0-1", "2-3", "4+"]);
export type ExerciseFrequencyCode = z.infer<typeof exerciseFrequencyCodeSchema>;

export const healthGoalCodeSchema = z.enum([
  "improve_posture",
  "reduce_pain",
  "increase_flexibility",
  "core_strength",
  "rehabilitation",
  "stress_reduction",
  "movement_quality",
]);
export type HealthGoalCode = z.infer<typeof healthGoalCodeSchema>;

export const discomfortMovementCodeSchema = z.enum([
  "sitting",
  "standing",
  "walking",
  "bending",
  "rotation",
  "balance",
]);
export type DiscomfortMovementCode = z.infer<typeof discomfortMovementCodeSchema>;

export const healthIntakeInputSchema = z
  .object({
    conditions: z.array(healthConditionCodeSchema).max(20),
    conditionsOther: z.string().min(1).max(500).optional(),
    underMedicalTreatment: z.boolean(),
    medicalTreatmentDetails: z.string().min(1).max(2000).optional(),
    pilatesExperience: z.array(pilatesExperienceCodeSchema).min(1).max(4),
    pilatesExperienceDuration: z.string().min(1).max(200).optional(),
    activityLevel: activityLevelCodeSchema,
    exerciseFrequency: exerciseFrequencyCodeSchema,
    goals: z.array(healthGoalCodeSchema).max(10),
    goalsOther: z.string().min(1).max(500).optional(),
    discomfortDuring: z.array(discomfortMovementCodeSchema).max(6),
    additionalNotes: z.string().min(1).max(2000).optional(),
    guardianName: z.string().min(1).max(120).optional(),
    guardianRelation: z.enum(["roditelj", "staratelj"]).optional(),
  })
  .refine(
    (d) =>
      !d.underMedicalTreatment ||
      (d.medicalTreatmentDetails?.trim().length ?? 0) > 0,
    {
      message:
        "medicalTreatmentDetails required when underMedicalTreatment is true",
      path: ["medicalTreatmentDetails"],
    },
  );
export type HealthIntakeInput = z.infer<typeof healthIntakeInputSchema>;

export const healthIntakeResponseSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  conditions: z.array(healthConditionCodeSchema),
  conditionsOther: z.string().nullable(),
  underMedicalTreatment: z.boolean(),
  medicalTreatmentDetails: z.string().nullable(),
  pilatesExperience: z.array(pilatesExperienceCodeSchema),
  pilatesExperienceDuration: z.string().nullable(),
  activityLevel: activityLevelCodeSchema,
  exerciseFrequency: exerciseFrequencyCodeSchema,
  goals: z.array(healthGoalCodeSchema),
  goalsOther: z.string().nullable(),
  discomfortDuring: z.array(discomfortMovementCodeSchema),
  additionalNotes: z.string().nullable(),
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

// ─── Client-facing packages-&-payments timeline ("Moji paketi") ──────────────
// A read-only, client-scoped mirror of admin Naplata seen through a PACKAGE
// lens. Each entry is one ClientPackage the caller has held.
//   - kind PAID: backed by a BillingRecord — amount + method shown.
//   - kind COMP: a Poklon paket (no BillingRecord) — no amount, no method.
// `method` is softened: COMPANY -> "PAID" (the raw chip is never shown to the
// client), MANUAL_ONLINE -> "ONLINE". A comp leaves no gap.
export const clientPackageTimelineEntrySchema = z.object({
  id: z.string(),
  packageTypeName: z.string(),
  sessionsRemaining: z.number(),
  expiresAt: z.string(),
  startsAt: z.string(),
  createdAt: z.string(),
  kind: z.enum(["PAID", "COMP"]),
  amount: z.nullable(z.number()),
  method: z.nullable(z.enum(["CASH", "CARD", "ONLINE", "PAID"])),
});
export type ClientPackageTimelineEntry = z.infer<
  typeof clientPackageTimelineEntrySchema
>;

export const clientPackagesTimelineResponseSchema = z.object({
  success: z.boolean(),
  entries: z.array(clientPackageTimelineEntrySchema),
});
export type ClientPackagesTimelineResponse = z.infer<
  typeof clientPackagesTimelineResponseSchema
>;

export const clientsResponseSchema = z.object({
  success: z.boolean(),
  clients: z.array(
    z.object({
      id: z.string(),
      notes: z.optional(z.nullable(z.string())),
      packageStatus: clientPackageStatusSchema,
      user: z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        fullName: z.string(), // derived
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
      firstName: z.string(),
      lastName: z.string(),
      fullName: z.string(), // derived
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

export const trainerNoteInputSchema = z.object({
  sessionId: z.uuid().optional(),
  clientProfileId: z.uuid(),
  note: z.string().min(1).max(500),
});
export type TrainerNoteInput = z.infer<typeof trainerNoteInputSchema>;

// Comma-separated UUIDs → string[]. Accepts a single UUID or several; the
// server treats the result as an `in` filter on the corresponding column.
const csvUuids = z
  .string()
  .optional()
  .transform((s) => {
    if (!s) return undefined;
    const parts = s
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return parts.length > 0 ? parts : undefined;
  })
  .pipe(z.array(z.uuid()).min(1).max(50).optional());

export const trainerNotesQuerySchema = z.object({
  // Singular form kept for back-compat with any existing callers; the
  // plural forms below take precedence when both are sent.
  sessionId: z.uuid().optional(),
  clientProfileId: z.uuid().optional(),
  sessionIds: csvUuids,
  clientProfileIds: csvUuids,
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

/**
 * A Campaign audience: optional axes ANDed together. `everyone` is mutually
 * exclusive with any narrowing axis. At least one axis must be chosen. The
 * audience is RE-COMPUTED at dispatch — this is only the stored intent.
 */
export const campaignAudienceSpecSchema = z
  .object({
    everyone: z.boolean().optional(),
    packageState: z.enum(["active", "expired", "none", "paused"]).optional(),
    classTypeId: z.guid().optional(),
    expiringSoonDays: z.number().int().positive().max(365).optional(),
    lapsedDays: z.number().int().positive().max(365).optional(),
    idlePackageDays: z.number().int().positive().max(365).optional(),
  })
  .refine(
    (spec) => {
      const narrowing =
        spec.packageState !== undefined ||
        spec.classTypeId !== undefined ||
        spec.expiringSoonDays !== undefined ||
        spec.lapsedDays !== undefined ||
        spec.idlePackageDays !== undefined;
      if (spec.everyone) return !narrowing;
      return narrowing;
    },
    {
      message:
        "Choose 'everyone' alone, or one or more narrowing axes (not both).",
    },
  )
  .refine(
    // `lapsed` means "no active package"; `idlePackage` means "has an active
    // package". They are mutually contradictory — ANDing them is always empty
    // and nonsensical — so forbid the combination at the boundary rather than
    // silently returning nobody.
    (spec) => !(spec.lapsedDays !== undefined && spec.idlePackageDays !== undefined),
    {
      message:
        "'lapsed' and 'idle package' are mutually exclusive (one means no active package, the other requires one).",
    },
  );
export type CampaignAudienceSpec = z.infer<typeof campaignAudienceSpecSchema>;

export const createCampaignInputSchema = z.object({
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(4000),
  audienceSpec: campaignAudienceSpecSchema,
  /** ISO instant; when present the campaign is saved SCHEDULED. */
  scheduledFor: z.iso.datetime().optional(),
  /** When true (and no scheduledFor) the campaign dispatches immediately. */
  sendNow: z.boolean().optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;

export const updateCampaignInputSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  body: z.string().min(1).max(4000).optional(),
  audienceSpec: campaignAudienceSpecSchema.optional(),
  scheduledFor: z.iso.datetime().nullable().optional(),
  /** Set "DRAFT" to cancel a SCHEDULED campaign back to a draft. */
  status: z.enum(["DRAFT", "SCHEDULED"]).optional(),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignInputSchema>;

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

