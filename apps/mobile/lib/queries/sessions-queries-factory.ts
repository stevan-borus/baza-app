import {
  queryOptions,
  mutationOptions,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
// The wire shape (incl. z.coerce.date() on startsAt/endsAt, so dayjs
// consumers keep receiving Date objects) lives in @baza/types — this factory
// used to shadow it with a local duplicate.
import { availabilityResponseSchema } from "@baza/types";
import { apiRequest } from "@/lib/api-request";

const sessionSchema = z.object({
  id: z.string(),
  classTypeId: z.string(),
  roomId: z.nullable(z.string()),
  trainerUserId: z.nullable(z.string()),
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]),
  classType: z.object({ id: z.string(), name: z.string() }).optional(),
  room: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});

const sessionsListResponseSchema = z.object({
  success: z.boolean(),
  sessions: z.array(sessionSchema),
});

const sessionMutationResponseSchema = z.object({
  success: z.boolean(),
  session: sessionSchema,
});

// Shared client + consent shape for both booked and waitlisted clients —
// the session-detail screen renders them with the same row + consent strip.
const sessionClientSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  client: z.object({
    id: z.string(),
    fullName: z.string(),
    email: z.string(),
  }),
  consentFlags: z.object({
    showFirstPilatesHint: z.boolean(),
    conditions: z.array(z.string()),
    conditionsOther: z.string().nullable(),
    additionalNotes: z.string().nullable(),
    intakeRecorded: z.boolean(),
    intakeWithdrawn: z.boolean(),
    socialMediaAccepted: z.boolean().nullable(),
  }),
});

const sessionDetailSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["SCHEDULED", "CANCELED", "COMPLETED"]),
  capacity: z.number(),
  isActive: z.boolean(),
  classTypeId: z.string(),
  roomId: z.nullable(z.string()),
  trainerUserId: z.nullable(z.string()),
  recurringScheduleId: z.nullable(z.string()).optional(),
  classType: z.object({ id: z.string(), name: z.string() }).nullable(),
  room: z.object({ id: z.string(), name: z.string() }).nullable(),
  trainer: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  bookedCount: z.number(),
  seriesBookedCount: z.number(),
  bookings: z.array(
    sessionClientSchema.extend({ createdAt: z.string() }),
  ),
  // Queued clients (capacity full). Empty array when nobody is waiting; the
  // UI hides the section entirely in that case.
  waitlist: z.array(
    sessionClientSchema.extend({ position: z.number() }),
  ),
});

const sessionDetailResponseSchema = z.object({
  success: z.boolean(),
  session: sessionDetailSchema,
});

export type Session = z.infer<typeof sessionSchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

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
          schema: z.object({
            success: z.boolean(),
            schedule: z.object({
              id: z.string(),
              classTypeId: z.string(),
              roomId: z.nullable(z.string()),
              trainerUserId: z.string(),
              weekdays: z.array(z.number()),
              timeOfDayMins: z.number(),
              durationMins: z.number(),
              capacity: z.number(),
              isActive: z.boolean(),
            }),
            futureBookingsCount: z.number(),
          }),
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
// (availabilityByMonth and recurring writes are not spliced — they're left to
// the component's own invalidation, which the builders no longer touch.)

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
    onSuccess: (data: SessionMutationResponse) => spliceSession(queryClient, data.session),
  };
}

export function updateSessionMutationOptions(queryClient: QueryClient) {
  return {
    ...sessionsQueries.update(),
    onSuccess: (data: SessionMutationResponse) => spliceSession(queryClient, data.session),
  };
}
