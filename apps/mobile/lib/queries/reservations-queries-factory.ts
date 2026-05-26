import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, throwIfNotOk } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/admin/reservations`;

const createResponseSchema = z.object({
  success: z.boolean(),
  reserved: z.number(),
  reservedSessionIds: z.array(z.string()),
  skippedFull: z.array(z.string()),
  skippedAlreadyBooked: z.array(z.string()),
  skippedMissing: z.array(z.string()),
});

const cancelBulkResponseSchema = z.object({
  success: z.boolean(),
  canceled: z.number(),
  promotedUserIds: z.array(z.string()),
});

export type CreateReservationsInput = {
  clientProfileId: string;
  sessionIds: string[];
};

export type CancelReservationsInput = {
  bookingIds: string[];
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
  return createResponseSchema.parse(await res.json());
}

export async function cancelReservationsBulkRequest(input: CancelReservationsInput) {
  const res = await apiFetch(`${BASE}/cancel-bulk`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  await throwIfNotOk(res, "Unable to cancel reservations");
  return cancelBulkResponseSchema.parse(await res.json());
}

export function useCreateReservationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["reservations", "create"] as const,
    mutationFn: createReservationsRequest,
    onSuccess: () => {
      // Server availability + per-client lists + per-client bookings list
      // may now reflect the new bookings. The bookings invalidation is
      // load-bearing for reservation mode itself — the already-booked badge
      // reads from the bookings query, so without this the screen would
      // still show the just-reserved cards as selectable on a refetch.
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useCancelReservationsBulkMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["reservations", "cancel-bulk"] as const,
    mutationFn: cancelReservationsBulkRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
