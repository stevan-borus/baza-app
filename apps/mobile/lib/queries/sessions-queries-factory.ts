import {
  queryOptions,
  mutationOptions,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
// The wire shapes (incl. z.coerce.date() on availability startsAt/endsAt, so
// dayjs consumers keep receiving Date objects) live in @baza/types — the
// server routes validate against the same schemas via respond().
import {
  availabilityResponseSchema,
  recurringScheduleResponseSchema,
  sessionsListResponseSchema,
  sessionMutationResponseSchema,
  sessionDetailResponseSchema,
  type Session,
  type SessionDetail,
} from "@baza/types/scheduling";
import { apiRequest } from "@/lib/api-request";

export type { Session, SessionDetail };

const sessionsAll = ["sessions"] as const;

export const sessionsQueries = {
  all: sessionsAll,

  availabilityByMonth: (month: string) =>
    queryOptions({
      queryKey: [...sessionsAll, "availability", month] as const,
      queryFn: () =>
        apiRequest("/api/sessions/availability", {
          params: { month },
          schema: availabilityResponseSchema,
          errorMessage: "Unable to load availability",
        }),
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),

  list: () =>
    queryOptions({
      queryKey: [...sessionsAll, "list"] as const,
      queryFn: () =>
        apiRequest("/api/sessions", {
          schema: sessionsListResponseSchema,
          errorMessage: "Unable to load sessions",
        }),
      staleTime: 30_000,
    }),

  byId: (id: string) =>
    queryOptions({
      queryKey: [...sessionsAll, "by-id", id] as const,
      queryFn: () =>
        apiRequest(`/api/sessions/${encodeURIComponent(id)}`, {
          schema: sessionDetailResponseSchema,
          errorMessage: "Unable to load session",
        }),
      staleTime: 30_000,
      enabled: !!id,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...sessionsAll, "create"] as const,
      mutationFn: async (payload: {
        classTypeId: string;
        roomId?: string;
        trainerUserId: string;
        startsAt: string;
        endsAt: string;
        capacity: number;
        isActive?: boolean;
      }) =>
        apiRequest("/api/sessions", {
          method: "POST",
          body: payload,
          schema: sessionMutationResponseSchema,
          errorMessage: "Unable to create session",
        }),
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...sessionsAll, "update"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        startsAt?: string;
        endsAt?: string;
        capacity?: number;
        roomId?: string | null;
        trainerUserId?: string;
        isActive?: boolean;
        status?: "SCHEDULED" | "CANCELED" | "COMPLETED";
      }) =>
        apiRequest(`/api/sessions/${id}`, {
          method: "PATCH",
          body: payload,
          schema: sessionMutationResponseSchema,
          errorMessage: "Unable to update session",
        }),
    }),

  createRecurring: () =>
    mutationOptions({
      mutationKey: [...sessionsAll, "create-recurring"] as const,
      mutationFn: async (payload: {
        classTypeId: string;
        roomId?: string;
        trainerUserId: string;
        startsAt: string;
        durationMins: number;
        capacity: number;
        weekCount: number;
        weekdays: number[];
        isActive?: boolean;
      }) =>
        apiRequest("/api/sessions/recurring", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to create recurring sessions",
        }),
    }),

  recurringSchedule: (id: string | null) =>
    queryOptions({
      queryKey: [...sessionsAll, "recurring-schedule", id] as const,
      enabled: !!id,
      queryFn: () =>
        apiRequest(`/api/sessions/recurring/${id}`, {
          schema: recurringScheduleResponseSchema,
          errorMessage: "Unable to load schedule",
        }),
      staleTime: 30_000,
    }),

  updateRecurring: () =>
    mutationOptions({
      mutationKey: [...sessionsAll, "update-recurring"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        roomId?: string | null;
        trainerUserId?: string;
        weekdays?: number[];
        timeOfDayMins?: number;
        durationMins?: number;
        capacity?: number;
        isActive?: boolean;
        weekCount?: number;
      }) =>
        apiRequest(`/api/sessions/recurring/${id}`, {
          method: "PATCH",
          body: payload,
          errorMessage: "Unable to update series",
        }),
    }),

  deleteRecurring: () =>
    mutationOptions({
      mutationKey: [...sessionsAll, "delete-recurring"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/sessions/recurring/${id}`, {
          method: "DELETE",
          errorMessage: "Unable to delete series",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// Single-session create/update return the full Session (incl. classType/room
// after the Layer 4 server widening), so splice the returned row into the
// `list` cache instead of invalidating. Append on create, replace-by-id on
// update. The byId DETAIL is deliberately left alone here — its shape carries
// extra nested bookings/waitlist this mutation doesn't return, so the caller
// invalidates just that one id's detail key as a separate side-effect.
// (availabilityByMonth is never spliced — create invalidates it so the Pregled
// overview refetches; update relies on the edit sheet's composed invalidation.
// Recurring writes are left entirely to the component's own invalidation.)

type SessionsListData = z.infer<typeof sessionsListResponseSchema>;
type SessionMutationResponse = z.infer<typeof sessionMutationResponseSchema>;
const sessionsListKey = sessionsQueries.list().queryKey;

function spliceSession(queryClient: QueryClient, session: Session) {
  queryClient.setQueryData<SessionsListData>(sessionsListKey, (prev) => {
    if (!prev) return prev;
    const exists = prev.sessions.some((s) => s.id === session.id);
    const sessions = exists
      ? prev.sessions.map((s) => (s.id === session.id ? session : s))
      : [...prev.sessions, session];
    return { ...prev, sessions };
  });
}

export function createSessionMutationOptions(queryClient: QueryClient) {
  return {
    ...sessionsQueries.create(),
    onSuccess: async (data: SessionMutationResponse) => {
      spliceSession(queryClient, data.session);
      // The Pregled overview calendar renders from availabilityByMonth, not
      // the list cache — without this invalidation a new one-off termin stays
      // invisible until app restart (no focus-refetch wiring in RN).
      await queryClient.invalidateQueries({
        queryKey: [...sessionsAll, "availability"],
      });
    },
  };
}

export function updateSessionMutationOptions(queryClient: QueryClient) {
  return {
    ...sessionsQueries.update(),
    onSuccess: (data: SessionMutationResponse) => spliceSession(queryClient, data.session),
  };
}
