import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelReservationsBulkResponseSchema,
  createReservationsResponseSchema,
} from "@baza/types/bookings";
import { apiFetch, throwIfNotOk } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/admin/reservations`;

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
export async function createReservationsRequest(input: CreateReservationsInput) {
  const res = await apiFetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  await throwIfNotOk(res, "Unable to create reservations");
  return createReservationsResponseSchema.parse(await res.json());
}

export async function cancelReservationsBulkRequest(input: CancelReservationsInput) {
  const res = await apiFetch(`${BASE}/cancel-bulk`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  await throwIfNotOk(res, "Unable to cancel reservations");
  return cancelReservationsBulkResponseSchema.parse(await res.json());
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
