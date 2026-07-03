import { z } from "zod";

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
  PACKAGE_EXHAUSTED: "PACKAGE_EXHAUSTED",
} as const;

export type BookingErrorCode =
  (typeof BOOKING_ERRORS)[keyof typeof BOOKING_ERRORS];
