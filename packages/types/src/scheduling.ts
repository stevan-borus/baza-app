import { z } from "zod";

// The Session fields the availability shape picks (id/capacity) as they exist
// on the Prisma Session model — everything else on the availability wire shape
// is added in the .extend() below. Hand-written so this package no longer
// depends on the generated prisma-zod tree.
const sessionFieldsSchema = z.object({
  id: z.string(),
  capacity: z.number().int(),
});

export const monthlyAvailabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const availabilitySessionSchema = sessionFieldsSchema.pick({
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
  // Admin-set binary "intermediate" (srednji nivo) marking for this occurrence; absent = unmarked.
  // Display-only — never gates booking or filtering.
  isIntermediate: z.boolean().optional(),
  // Admin-set binary "mixed group" marking (men and women train together);
  // absent = unmarked. Display-only, and orthogonal to isIntermediate.
  isMixedGroup: z.boolean().optional(),
  recurringScheduleId: z.nullable(z.string()).optional(),
  isActive: z.boolean().optional(),
  isBookedByMe: z.boolean().optional(),
  // True when the current client sits on this session's waitlist (full class).
  // Drives the booking sheet's "leave waitlist" state. Absent (staff / older
  // cached payloads) means not waitlisted.
  isWaitlistedByMe: z.boolean().optional(),
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
   * - "RENEW"       — the client owns a package for this class but every one is
   *                   expired / used up (the true "renew me" case).
   * - "PAUSED"      — the client owns a live matching package but is inside an
   *                   active pause window they set on purpose; booking resumes
   *                   when the pause ends.
   * - "NOT_STARTED" — the client owns a matching package (with sessions) whose
   *                   start date is in the future; booking opens then.
   * - "FULLY_HELD"  — an eligible package exists, but every remaining session
   *                   is already committed to future bookings/waitlist holds;
   *                   booking would 409 until one of them is canceled.
   * - "EMPTY_CUTOFF" — nobody has booked this session and its own
   *                   empty-booking cutoff window has begun; the studio won't
   *                   open the room, so nobody can book it (not per-client).
   * PAUSED / NOT_STARTED / EMPTY_CUTOFF are additive (older clients that only
   * know RENEW / FULLY_HELD fall back to the generic renewal copy).
   */
  lockReason: z
    .enum(["RENEW", "PAUSED", "NOT_STARTED", "FULLY_HELD", "EMPTY_CUTOFF"])
    .optional(),
  /**
   * This session's empty-booking cutoff in hours, so the sheet can name the
   * window in its copy. Present only when lockReason === "EMPTY_CUTOFF".
   */
  emptyBookingCutoffHours: z.number().optional(),
  /**
   * True when the session has no active bookings AND its own
   * empty-booking cutoff window has begun — i.e. clients can no longer sign
   * up and the class will not run unless an admin books someone manually.
   *
   * Display-only, and sent for EVERY role: it never gates booking (staff
   * bypass the rule entirely, and the client gate is `bookable`/`lockReason`).
   * Staff read it for the "closed — plan around it" signal the whole rule
   * exists to give them. Absent/false means the session is still open.
   */
  emptyCutoffLocked: z.boolean().optional(),
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

export const createSessionInputSchema = z.object({
  classTypeId: z.uuid(),
  roomId: z.uuid().optional(),
  trainerUserId: z.uuid(),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  capacity: z.number().int().positive(),
  // Hours before start at which this occurrence, with zero active bookings,
  // stops accepting client bookings. Nonnegative, not positive: 0 is the
  // documented "rule off for this occurrence" value.
  emptyBookingCutoffHours: z.number().int().nonnegative().default(4),
  isActive: z.boolean().default(true),
});

// Spelled out rather than `createSessionInputSchema.partial()`: .partial()
// keeps the .default()s, so a PATCH that never mentions
// emptyBookingCutoffHours would still parse to 4 and overwrite a configured
// value. PATCH must only carry the keys the admin actually sent.
export const updateSessionInputSchema = z.object({
  startsAt: z.string().min(10).optional(),
  endsAt: z.string().min(10).optional(),
  capacity: z.number().int().positive().optional(),
  roomId: z.uuid().nullable().optional(),
  trainerUserId: z.uuid().optional(),
  isActive: z.boolean().optional(),
  // Per-occurrence empty-booking cutoff; omitted = untouched. 0 turns the
  // rule off for this session.
  emptyBookingCutoffHours: z.number().int().nonnegative().optional(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]).optional(),
  // Optional binary "intermediate" (srednji nivo) marking for this occurrence; omitted = untouched.
  isIntermediate: z.boolean().optional(),
  // Optional binary "mixed group" marking for this occurrence; omitted = untouched.
  isMixedGroup: z.boolean().optional(),
});

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
  isIntermediate: z.boolean().optional(),
  isMixedGroup: z.boolean().optional(),
  // Per-occurrence empty-booking cutoff, echoed back so the edit sheet can
  // rehydrate the field it just saved. Optional for older cached payloads.
  emptyBookingCutoffHours: z.number().optional(),
  classType: z.object({ id: z.string(), name: z.string() }).optional(),
  room: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionsListResponseSchema = z.object({
  success: z.boolean(),
  sessions: z.array(sessionSchema),
});

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

export const sessionDetailSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]),
  capacity: z.number(),
  isActive: z.boolean(),
  isIntermediate: z.boolean().optional(),
  isMixedGroup: z.boolean().optional(),
  classTypeId: z.string(),
  roomId: z.nullable(z.string()),
  trainerUserId: z.nullable(z.string()),
  recurringScheduleId: z.nullable(z.string()).optional(),
  classType: z.object({ id: z.string(), name: z.string() }).nullable(),
  room: z.object({ id: z.string(), name: z.string() }).nullable(),
  trainer: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  bookedCount: z.number(),
  seriesBookedCount: z.number(),
  /**
   * True when this session has no active bookings AND its own
   * empty-booking cutoff window has begun — clients can no longer sign up.
   * Display-only: the detail screen says so in words, so the trainer knows
   * the class won't run unless an admin books someone manually.
   */
  emptyCutoffLocked: z.boolean().optional(),
  /**
   * This session's empty-booking cutoff in hours, so the detail screen can
   * name the window and the edit sheet can rehydrate the input.
   */
  emptyBookingCutoffHours: z.number().optional(),
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

export const deleteSessionResponseSchema = z.object({
  success: z.boolean(),
});

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

export const updateRecurringSeriesResponseSchema = z.object({
  success: z.boolean(),
  schedule: recurringScheduleSchema,
});

export const deleteRecurringSeriesResponseSchema = z.object({
  success: z.boolean(),
});
