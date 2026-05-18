import {
  infiniteQueryOptions,
  mutationOptions,
} from "@tanstack/react-query";
import { z } from "zod";
import { bookingMutationResultSchema } from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

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

async function fetchClientBookingsPage(params: {
  clientUserId: string;
  period: "upcoming" | "past";
  limit?: number;
  cursor?: string | null;
}) {
  const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients/${encodeURIComponent(params.clientUserId)}/bookings`;
  const searchParams = new URLSearchParams();
  searchParams.set("period", params.period);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);
  // ADR-0003: don't use `searchParams.size` — RN's URLSearchParams polyfill
  // returns `undefined` for it, so `size > 0` is always false and the query
  // string gets dropped. `toString()` returns "" when no params, which we
  // check directly.
  const qs = searchParams.toString();
  const url = qs ? `${endpoint}?${qs}` : endpoint;
  const response = await apiFetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Unable to load client bookings (${response.status})`);
  }
  return clientBookingsResponseSchema.parse(await response.json());
}

export const bookingsQueries = {
  mutateBooking: () =>
    mutationOptions({
      mutationKey: ["bookings", "mutate"] as const,
      mutationFn: async (payload: { sessionId: string; action: "BOOK" | "CANCEL" }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/bookings`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          // Surface the server's error code (e.g. GUARDIAN_VERIFICATION_REQUIRED)
          // so the UI can render a specific message instead of a generic toast.
          let serverCode: string | undefined;
          try {
            const errBody = await response.json();
            if (typeof errBody?.error === "string") serverCode = errBody.error;
          } catch {
            // Non-JSON body — fall back to status code.
          }
          const err = new Error(serverCode ?? `Booking request failed (${response.status})`);
          // Attach the code as a static prop so callers can branch on it
          // without parsing the message string.
          (err as Error & { code?: string }).code = serverCode;
          throw err;
        }
        const result = await response.json();
        return bookingMutationResultSchema.parse(result);
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
        "bookings",
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
