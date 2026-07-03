import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelReservationsBulkResponseSchema,
  createReservationsResponseSchema,
} from "@baza/types/bookings";
import { apiRequest } from "@/lib/api-request";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";

const BASE = "/api/admin/reservations";

const reservationsAll = ["reservations"] as const;

export type CreateReservationsInput = {
  clientProfileId: string;
  sessionIds: string[];
};

export type CancelReservationsInput = {
  bookingIds: string[];
  /** When true, skip the late-cancel forfeit and stamp the acting admin as the waiver. */
  waiveCharge?: boolean;
};

// Exported so unit tests can exercise the request/response contract without
// the React tree. The hooks below wrap these for invalidation behavior.
export function createReservationsRequest(input: CreateReservationsInput) {
  return apiRequest(BASE, {
    method: "POST",
    body: input,
    schema: createReservationsResponseSchema,
    errorMessage: "Unable to create reservations",
  });
}

export function cancelReservationsBulkRequest(input: CancelReservationsInput) {
  return apiRequest(`${BASE}/cancel-bulk`, {
    method: "POST",
    body: input,
    schema: cancelReservationsBulkResponseSchema,
    errorMessage: "Unable to cancel reservations",
  });
}

export function useCreateReservationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...reservationsAll, "create"] as const,
    mutationFn: createReservationsRequest,
    onSuccess: () => {
      // Server availability + per-client lists + per-client bookings list
      // may now reflect the new bookings. The bookings invalidation is
      // load-bearing for reservation mode itself — the already-booked badge
      // reads from the bookings query, so without this the screen would
      // still show the just-reserved cards as selectable on a refetch.
      qc.invalidateQueries({ queryKey: sessionsQueries.all });
      qc.invalidateQueries({ queryKey: clientsQueries.all });
      qc.invalidateQueries({ queryKey: bookingsQueries.all });
    },
  });
}

export function useCancelReservationsBulkMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...reservationsAll, "cancel-bulk"] as const,
    mutationFn: cancelReservationsBulkRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionsQueries.all });
      qc.invalidateQueries({ queryKey: clientsQueries.all });
      qc.invalidateQueries({ queryKey: bookingsQueries.all });
    },
  });
}
