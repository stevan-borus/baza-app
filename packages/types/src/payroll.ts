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

export const payrollMonthSchema = z.object({
  trainerUserId: z.string(),
  trainerName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  // Null when no rate is configured for the trainer — the payout is then 0 and
  // the UI tells the admin to set a rate.
  percent: z.number().nullable(),
  status: z.enum(["OPEN", "LOCKED"]),
  lockedAt: z.string().nullable(),
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
      percent: z.number().nullable(),
      status: z.enum(["OPEN", "LOCKED"]),
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
  percent: z.number(),
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

export const createTrainerRateInputSchema = z.object({
  trainerUserId: z.string().min(1),
  // A commission, so 0–100. Whole percent: the studio negotiates in points.
  percent: z.number().int().min(0).max(100),
  effectiveFrom: z.string().min(10),
  note: z.string().max(300).optional(),
});

export const createTrainerRateResponseSchema = z.object({
  success: z.boolean(),
  rate: trainerRateSchema,
});

// ─── Period lock / adjustments ───────────────────────────────────────────────

export const lockPayrollPeriodInputSchema = z.object({
  trainerUserId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  // Unlocking is deliberately possible: month one will need corrections, and a
  // one-way lock would force data surgery. The reason is recorded.
  unlock: z.boolean().optional(),
});

export const lockPayrollPeriodResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(["OPEN", "LOCKED"]),
  lineCount: z.number(),
  payout: z.number(),
});

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
