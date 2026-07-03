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
