import { z } from "zod";

export const bookingActionSchema = z.enum(["BOOK", "CANCEL"]);

export const bookingMutationInputSchema = z.object({
  sessionId: z.uuid(),
  action: bookingActionSchema,
});

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

// ── Admin reservation wire shapes (/api/admin/reservations[/cancel-bulk]) ──

// Ids are plain strings, not uuids: an unknown sessionId is a *domain*
// outcome (reported back as skippedMissing), not a validation error.
export const createReservationsInputSchema = z.object({
  clientProfileId: z.string().min(1),
  sessionIds: z.array(z.string().min(1)).min(1),
});
export type CreateReservationsInput = z.infer<
  typeof createReservationsInputSchema
>;

export const cancelReservationsBulkInputSchema = z.object({
  bookingIds: z.array(z.string().min(1)).min(1),
  waiveCharge: z.boolean().optional().default(false),
});

export const createReservationsResponseSchema = z.object({
  success: z.boolean(),
  reserved: z.number(),
  reservedSessionIds: z.array(z.string()),
  skippedFull: z.array(z.string()),
  skippedAlreadyBooked: z.array(z.string()),
  skippedMissing: z.array(z.string()),
});

export const cancelReservationsBulkResponseSchema = z.object({
  success: z.boolean(),
  canceled: z.number(),
  promotedUserIds: z.array(z.string()),
});

// GET /api/clients/[id]/bookings — one booking row in a client's history.
// Status is derived server-side from Booking.canceledAt (the schema has no
// BookingStatus enum); dates are ISO strings.
export const clientBookingItemSchema = z.object({
  id: z.string(),
  status: z.enum(["CONFIRMED", "CANCELED"]),
  bookedAt: z.string(),
  canceledAt: z.nullable(z.string()),
  session: z.object({
    id: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    classType: z.object({ id: z.string(), name: z.string() }),
    room: z.nullable(z.object({ id: z.string(), name: z.string() })),
    trainer: z.nullable(z.object({ id: z.string(), fullName: z.string() })),
  }),
});
export type ClientBooking = z.infer<typeof clientBookingItemSchema>;

export const clientBookingsResponseSchema = z.object({
  success: z.boolean(),
  bookings: z.array(clientBookingItemSchema),
  nextCursor: z.nullable(z.string()),
});
export type ClientBookingsResponse = z.infer<
  typeof clientBookingsResponseSchema
>;

export const BOOKING_ERRORS = {
  GUARDIAN_VERIFICATION_REQUIRED: "GUARDIAN_VERIFICATION_REQUIRED",
  SESSION_IN_PAST: "SESSION_IN_PAST",
  PACKAGE_EXHAUSTED: "PACKAGE_EXHAUSTED",
} as const;

