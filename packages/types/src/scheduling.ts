import { z } from "zod";
import { SessionResultSchema } from "./generated/prisma-zod/schemas/variants/result/Session.result";

export const monthlyAvailabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});
export type MonthlyAvailabilityQuery = z.infer<
  typeof monthlyAvailabilityQuerySchema
>;

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
  /**
   * False when the client owns a (lapsed/used-up/paused) package for this
   * class but has no ELIGIBLE package to book with — the session renders
   * greyed out with a renewal CTA instead of disappearing. Staff always get
   * true. Absent (old cached payloads) means bookable.
   */
  bookable: z.boolean().optional(),
  /**
   * Why the session is not bookable. Present only when `bookable` is false
   * (same optional-field pattern as `bookable` — staff payloads and older
   * cached responses omit it):
   * - "RENEW"      — the client owns a package for this class but none is
   *                  eligible (expired / used up / paused / not started).
   * - "FULLY_HELD" — an eligible package exists, but every remaining session
   *                  is already committed to future bookings/waitlist holds;
   *                  booking would 409 until one of them is canceled.
   */
  lockReason: z.enum(["RENEW", "FULLY_HELD"]).optional(),
  /**
   * True when booking this session would take the client's LAST bookable
   * slot on their eligible package (sessionsRemaining − held slots === 1).
   * Drives the "renew to keep training" warning at confirm time.
   */
  lastBookableSlot: z.boolean().optional(),
});
export type AvailabilitySession = z.infer<typeof availabilitySessionSchema>;

export const availabilityResponseSchema = z.object({
  success: z.boolean(),
  month: z.string(),
  sessions: z.array(availabilitySessionSchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

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

// ── Session wire shapes (GET/POST /api/sessions, GET/PATCH /api/sessions/[id]) ──

export const sessionSchema = z.object({
  id: z.string(),
  classTypeId: z.string(),
  roomId: z.nullable(z.string()),
  trainerUserId: z.nullable(z.string()),
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]),
  classType: z.object({ id: z.string(), name: z.string() }).optional(),
  room: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionsListResponseSchema = z.object({
  success: z.boolean(),
  sessions: z.array(sessionSchema),
});
export type SessionsListResponse = z.infer<typeof sessionsListResponseSchema>;

/** Single-session create/update both return the full session row. */
export const sessionMutationResponseSchema = z.object({
  success: z.boolean(),
  session: sessionSchema,
});
export type SessionMutationResponse = z.infer<
  typeof sessionMutationResponseSchema
>;

// Shared client + consent shape for both booked and waitlisted clients —
// the session-detail screen renders them with the same row + consent strip.
export const sessionClientSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  client: z.object({
    id: z.string(),
    fullName: z.string(),
    email: z.string(),
  }),
  consentFlags: z.object({
    showFirstPilatesHint: z.boolean(),
    conditions: z.array(z.string()),
    conditionsOther: z.string().nullable(),
    additionalNotes: z.string().nullable(),
    intakeRecorded: z.boolean(),
    intakeWithdrawn: z.boolean(),
    socialMediaAccepted: z.boolean().nullable(),
  }),
});
export type SessionClient = z.infer<typeof sessionClientSchema>;

export const sessionDetailSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]),
  capacity: z.number(),
  isActive: z.boolean(),
  classTypeId: z.string(),
  roomId: z.nullable(z.string()),
  trainerUserId: z.nullable(z.string()),
  recurringScheduleId: z.nullable(z.string()).optional(),
  classType: z.object({ id: z.string(), name: z.string() }).nullable(),
  room: z.object({ id: z.string(), name: z.string() }).nullable(),
  trainer: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  bookedCount: z.number(),
  seriesBookedCount: z.number(),
  bookings: z.array(sessionClientSchema.extend({ createdAt: z.string() })),
  // Queued clients (capacity full). Empty array when nobody is waiting; the
  // UI hides the section entirely in that case.
  waitlist: z.array(sessionClientSchema.extend({ position: z.number() })),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const sessionDetailResponseSchema = z.object({
  success: z.boolean(),
  session: sessionDetailSchema,
});
export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;

export const deleteSessionResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteSessionResponse = z.infer<typeof deleteSessionResponseSchema>;

// ── Recurring-series wire shapes (/api/sessions/recurring[/[id]]) ──────────

export const recurringScheduleSchema = z.object({
  id: z.string(),
  classTypeId: z.string(),
  roomId: z.nullable(z.string()),
  trainerUserId: z.string(),
  weekdays: z.array(z.number()),
  timeOfDayMins: z.number(),
  durationMins: z.number(),
  capacity: z.number(),
  isActive: z.boolean(),
});
export type RecurringSchedule = z.infer<typeof recurringScheduleSchema>;

export const recurringScheduleResponseSchema = z.object({
  success: z.boolean(),
  schedule: recurringScheduleSchema,
  futureBookingsCount: z.number(),
});
export type RecurringScheduleResponse = z.infer<
  typeof recurringScheduleResponseSchema
>;

export const createRecurringSessionsResponseSchema = z.object({
  success: z.boolean(),
  count: z.number(),
  scheduleId: z.string(),
  sessions: z.array(
    z.object({
      id: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      capacity: z.number(),
      status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]),
      trainerUserId: z.string(),
      recurringScheduleId: z.nullable(z.string()),
    }),
  ),
});
export type CreateRecurringSessionsResponse = z.infer<
  typeof createRecurringSessionsResponseSchema
>;

export const updateRecurringSeriesResponseSchema = z.object({
  success: z.boolean(),
  schedule: recurringScheduleSchema,
});
export type UpdateRecurringSeriesResponse = z.infer<
  typeof updateRecurringSeriesResponseSchema
>;

export const deleteRecurringSeriesResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteRecurringSeriesResponse = z.infer<
  typeof deleteRecurringSeriesResponseSchema
>;
