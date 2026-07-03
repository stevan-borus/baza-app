import {
  infiniteQueryOptions,
  mutationOptions,
} from "@tanstack/react-query";
import { z } from "zod";
import { bookingMutationResultSchema } from "@baza/types/bookings";
import { ApiError } from "@/lib/api-error";
import { apiRequest } from "@/lib/api-request";

const clientBookingItemSchema = z.object({
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

export const clientBookingsResponseSchema = z.object({
  success: z.boolean(),
  bookings: z.array(clientBookingItemSchema),
  nextCursor: z.nullable(z.string()),
});

export type ClientBooking = z.infer<typeof clientBookingItemSchema>;
export type ClientBookingsResponse = z.infer<typeof clientBookingsResponseSchema>;

function fetchClientBookingsPage(params: {
  clientUserId: string;
  period: "upcoming" | "past";
  limit?: number;
  cursor?: string | null;
}) {
  return apiRequest(
    `/api/clients/${encodeURIComponent(params.clientUserId)}/bookings`,
    {
      params: { period: params.period, limit: params.limit, cursor: params.cursor },
      schema: clientBookingsResponseSchema,
      errorMessage: "Unable to load client bookings",
    },
  );
}

const bookingsAll = ["bookings"] as const;

export const bookingsQueries = {
  all: bookingsAll,

  mutateBooking: () =>
    mutationOptions({
      mutationKey: [...bookingsAll, "mutate"] as const,
      mutationFn: async (payload: { sessionId: string; action: "BOOK" | "CANCEL" }) => {
        try {
          return await apiRequest("/api/bookings", {
            method: "POST",
            body: payload,
            schema: bookingMutationResultSchema,
            errorMessage: "Booking request failed",
          });
        } catch (e) {
          if (e instanceof ApiError) {
            // Surface the server's error code (e.g. GUARDIAN_VERIFICATION_REQUIRED)
            // so the UI can render a specific message instead of a generic toast.
            const bodyError = (e.body as { error?: unknown } | null)?.error;
            const serverCode = typeof bodyError === "string" ? bodyError : undefined;
            const err = new Error(serverCode ?? `Booking request failed (${e.status})`);
            // Attach the code as a static prop so callers can branch on it
            // without parsing the message string.
            (err as Error & { code?: string }).code = serverCode;
            throw err;
          }
          throw e;
        }
      },
    }),

  byClient: (params: {
    clientUserId: string;
    period: "upcoming" | "past";
    limit?: number;
  }) =>
    infiniteQueryOptions({
      // Spread into the key as primitives so React Query's deep-equal cache
      // lookup compares strings rather than fresh object identities.
      queryKey: [
        ...bookingsAll,
        "by-client",
        params.clientUserId,
        params.period,
        params.limit ?? 0,
      ] as const,
      queryFn: ({ pageParam }) =>
        fetchClientBookingsPage({
          clientUserId: params.clientUserId,
          period: params.period,
          limit: params.limit,
          cursor: pageParam,
        }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
    }),
};
