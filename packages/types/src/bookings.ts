import { z } from "zod";

export const bookingActionSchema = z.enum(["BOOK", "CANCEL", "LEAVE_WAITLIST"]);

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
    "LEFT_WAITLIST",
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
  // Whether this booking cost the client a session. Set on CANCELED rows so
  // the client history can separate a forfeited late cancel (worth showing
  // in "Otkazani") from a free early one (noise the studio asked us to drop).
  // Optional: existing consumers that never asked for it keep validating.
  consumedSession: z.boolean().optional(),
  session: z.object({
    id: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    // Admin-set binary "intermediate" (srednji nivo) marking for this occurrence; absent = unmarked.
    isIntermediate: z.boolean().optional(),
    // Admin-set binary "mixed group" marking for this occurrence; absent = unmarked.
    isMixedGroup: z.boolean().optional(),
    classType: z.object({ id: z.string(), name: z.string() }),
    room: z.nullable(z.object({ id: z.string(), name: z.string() })),
    trainer: z.nullable(z.object({ id: z.string(), fullName: z.string() })),
  }),
});
export type ClientBooking = z.infer<typeof clientBookingItemSchema>;

// Which slice of the `past` period to return. Omitted = the whole period,
// which is what the admin history and every pre-existing caller wants.
//   attended — past, not cancelled (the "Održani" tab).
//   canceled — cancelled AND the cancellation consumed a session ("Otkazani").
export const clientBookingOutcomeSchema = z.enum(["attended", "canceled"]);
export type ClientBookingOutcome = z.infer<typeof clientBookingOutcomeSchema>;

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
  SESSION_ALREADY_STARTED: "SESSION_ALREADY_STARTED",
  PACKAGE_EXHAUSTED: "PACKAGE_EXHAUSTED",
  EMPTY_SESSION_CUTOFF: "EMPTY_SESSION_CUTOFF",
} as const;

