import { z } from "zod";

/**
 * Trainer payroll: a month of held sessions, what each attendee's package was
 * worth, and the trainer's agreed cut of it.
 */

// ─── Shared shapes ───────────────────────────────────────────────────────────

export const payrollAttendeeSchema = z.object({
  bookingId: z.string(),
  clientName: z.string(),
  packageName: z.string(),
  // Null when the attendee's package carries no price — surfaced in the UI as
  // a warning rather than silently counted as zero.
  sessionValue: z.number().nullable(),
  isGift: z.boolean(),
});

export const payrollSessionSchema = z.object({
  sessionId: z.string(),
  startsAt: z.string(),
  classTypeName: z.string(),
  attendees: z.array(payrollAttendeeSchema),
  gross: z.number(),
  unpricedCount: z.number(),
});

/**
 * A commission, 0–100, to at most ONE decimal place.
 *
 * The studio was assumed to negotiate in whole points and it doesn't — moving
 * a trainer 22% → 22.5% has to be representable. It stops there: 22.55% is a
 * number nobody agrees to, and every payout would carry the rounding of it
 * forever.
 *
 * The precision check multiplies by ten and rounds, rather than counting the
 * digits of a string: 22.5 is not exactly representable in binary, so
 * `(v * 10) % 1 === 0` is a coin flip on values the studio actually types.
 */
const commissionPercent = z
  .number()
  .min(0)
  .max(100)
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, {
    message: "percent may have at most one decimal place",
  });

/**
 * One slice of the month's payout. A trainer's cut is not one number — an
 * individual pays a different percentage than a group — so a class type they
 * hold an override on gets its own bucket, and everything else falls into the
 * single default bucket (`classTypeId === null`).
 */
export const payrollBucketSchema = z.object({
  classTypeId: z.string().nullable(),
  classTypeName: z.string().nullable(),
  // Null when the trainer has no rate covering this bucket: it pays 0, and the
  // UI tells the admin to set a rate rather than inventing a percentage.
  percent: commissionPercent.nullable(),
  gross: z.number(),
  payout: z.number(),
});
export type PayrollBucket = z.infer<typeof payrollBucketSchema>;

export const payrollMonthSchema = z.object({
  trainerUserId: z.string(),
  trainerName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  // The payout, broken down by rate. Empty when the month held no sessions.
  buckets: z.array(payrollBucketSchema),
  sessions: z.array(payrollSessionSchema),
  sessionCount: z.number(),
  attendeeCount: z.number(),
  gross: z.number(),
  payout: z.number(),
  adjustmentTotal: z.number(),
  /** payout + adjustmentTotal — what the trainer is actually owed. */
  netPayout: z.number(),
  unpricedCount: z.number(),
  giftCount: z.number(),
  adjustments: z.array(
    z.object({
      id: z.string(),
      amount: z.number(),
      note: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type PayrollMonth = z.infer<typeof payrollMonthSchema>;

// ─── GET /api/payroll/month?year=&month=[&trainerUserId=] ────────────────────

export const payrollMonthResponseSchema = z.object({
  success: z.boolean(),
  month: payrollMonthSchema,
});
export type PayrollMonthResponse = z.infer<typeof payrollMonthResponseSchema>;

// ─── GET /api/payroll/summary?year=&month= (admin: every trainer) ────────────

export const payrollSummaryResponseSchema = z.object({
  success: z.boolean(),
  periodStart: z.string(),
  periodEnd: z.string(),
  trainers: z.array(
    z.object({
      trainerUserId: z.string(),
      trainerName: z.string(),
      sessionCount: z.number(),
      attendeeCount: z.number(),
      gross: z.number(),
      payout: z.number(),
      netPayout: z.number(),
      unpricedCount: z.number(),
      giftCount: z.number(),
    }),
  ),
  totalPayout: z.number(),
});
export type PayrollSummaryResponse = z.infer<typeof payrollSummaryResponseSchema>;

// ─── Trainer rates ───────────────────────────────────────────────────────────

export const trainerRateSchema = z.object({
  id: z.string(),
  trainerUserId: z.string(),
  // Null is a TOMBSTONE — only ever on a scoped row — meaning "from here this
  // class type is paid the default rate again". Ending an override this way
  // keeps the history append-only, so settled months never move.
  percent: commissionPercent.nullable(),
  // Null = the trainer's default rate; set = an override for one class type.
  classTypeId: z.string().nullable(),
  classTypeName: z.string().nullable(),
  effectiveFrom: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  // Entry order — the tiebreaker between rates sharing an effectiveFrom, which
  // every rate set on the same day does (a rate starts at the studio-day
  // boundary). createdAt cannot serve: Postgres now() is transaction time, so
  // rows written together carry the same timestamp.
  seq: z.number(),
});

export const trainerRatesResponseSchema = z.object({
  success: z.boolean(),
  rates: z.array(trainerRateSchema),
});
export type TrainerRatesResponse = z.infer<typeof trainerRatesResponseSchema>;

export const createTrainerRateInputSchema = z
  .object({
    trainerUserId: z.string().min(1),
    // Null ends a class-type override — see the superRefine below.
    percent: commissionPercent.nullable(),
    // Omitted = the trainer's default rate; set = an override for one class
    // type.
    classTypeId: z.string().min(1).optional(),
    effectiveFrom: z.string().min(10),
    note: z.string().max(300).optional(),
  })
  .superRefine((input, ctx) => {
    // A null percent means "revert to the default". On the default scope there
    // is nothing to revert to, and the month would quietly pay zero.
    if (input.percent === null && !input.classTypeId) {
      ctx.addIssue({
        code: "custom",
        path: ["percent"],
        message: "percent may only be null on a class-type override",
      });
    }
  });

export const createTrainerRateResponseSchema = z.object({
  success: z.boolean(),
  rate: trainerRateSchema,
});

// ─── Adjustments ─────────────────────────────────────────────────────────────

export const createPayrollAdjustmentInputSchema = z.object({
  trainerUserId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  // Signed: a negative amount deducts.
  amount: z.number().int(),
  note: z.string().min(1).max(300),
});

export const createPayrollAdjustmentResponseSchema = z.object({
  success: z.boolean(),
  adjustment: z.object({
    id: z.string(),
    amount: z.number(),
    note: z.string(),
    createdAt: z.string(),
  }),
});
