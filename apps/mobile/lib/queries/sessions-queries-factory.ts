import { queryOptions, mutationOptions, keepPreviousData } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, throwIfNotOk } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

// Local availability schema — duplicates @baza/types but uses z.coerce.date()
// so the wire format (ISO strings) parses into Date objects for `dayjs(...)`
// consumers. Kept local to avoid Metro's flaky cross-package HMR.
const attendanceSchema = z.object({
  consumedCount: z.number(),
  canceledCount: z.number(),
  totalBookings: z.number(),
});

const availabilityResponseSchema = z.object({
  success: z.boolean(),
  month: z.string(),
  sessions: z.array(
    z.object({
      id: z.string(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      capacity: z.number(),
      classTypeName: z.string(),
      roomId: z.nullable(z.string()).optional(),
      roomName: z.nullable(z.string()),
      trainerUserId: z.nullable(z.string()).optional(),
      trainerName: z.nullable(z.string()).optional(),
      bookedCount: z.number(),
      waitlistCount: z.number(),
      availableSlots: z.number(),
      recurringScheduleId: z.nullable(z.string()).optional(),
      isActive: z.boolean().optional(),
      // Post-cron attendance markers — present on past sessions only.
      attendance: z.nullable(attendanceSchema).optional(),
      // Server flag: does the current CLIENT user have an active booking on
      // this session? Used by the BookingSheet to render the "already booked"
      // state. Optional because admin/trainer responses don't include it.
      isBookedByMe: z.boolean().optional(),
      // Server flag: late-cancel-hours window from the client's package on
      // this session — null when the user has no active booking. Used by
      // the cancel confirmation to warn that the cancellation would
      // consume a session.
      lateCancelHours: z.nullable(z.number()).optional(),
    }),
  ),
});

export type SessionAttendance = z.infer<typeof attendanceSchema>;

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
    z.object({
      id: z.string(),
      createdAt: z.string(),
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
    }),
  ),
});

const sessionDetailResponseSchema = z.object({
  success: z.boolean(),
  session: sessionDetailSchema,
});

export type Session = z.infer<typeof sessionSchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const sessionsQueries = {
  availabilityByMonth: (month: string) =>
    queryOptions({
      queryKey: ["sessions", "availability", month] as const,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/availability?month=${encodeURIComponent(month)}`,
          { credentials: "include" },
        );
        if (!response.ok)
          throw new Error(`Unable to load availability (${response.status})`);
        return availabilityResponseSchema.parse(await response.json());
      },
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),

  list: () =>
    queryOptions({
      queryKey: ["sessions", "list"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load sessions (${response.status})`);
        return sessionsListResponseSchema.parse(await response.json());
      },
      staleTime: 30_000,
    }),

  byId: (id: string) =>
    queryOptions({
      queryKey: ["sessions", "by-id", id] as const,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/${encodeURIComponent(id)}`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to load session (${response.status})`);
        return sessionDetailResponseSchema.parse(await response.json());
      },
      staleTime: 30_000,
      enabled: !!id,
    }),

  create: () =>
    mutationOptions({
      mutationKey: ["sessions", "create"] as const,
      mutationFn: async (payload: {
        classTypeId: string;
        roomId?: string;
        trainerUserId: string;
        startsAt: string;
        endsAt: string;
        capacity: number;
        isActive?: boolean;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        await throwIfNotOk(response, "Unable to create session");
        return response.json();
      },
    }),

  update: () =>
    mutationOptions({
      mutationKey: ["sessions", "update"] as const,
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
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        await throwIfNotOk(response, "Unable to update session");
        return response.json();
      },
    }),

  createRecurring: () =>
    mutationOptions({
      mutationKey: ["sessions", "create-recurring"] as const,
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
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/recurring`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        await throwIfNotOk(response, "Unable to create recurring sessions");
        return response.json();
      },
    }),

  recurringSchedule: (id: string | null) =>
    queryOptions({
      queryKey: ["sessions", "recurring-schedule", id] as const,
      enabled: !!id,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/recurring/${id}`,
          { credentials: "include" },
        );
        if (!response.ok)
          throw new Error(`Unable to load schedule (${response.status})`);
        return z
          .object({
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
          })
          .parse(await response.json());
      },
      staleTime: 30_000,
    }),

  updateRecurring: () =>
    mutationOptions({
      mutationKey: ["sessions", "update-recurring"] as const,
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
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/recurring/${id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        await throwIfNotOk(response, "Unable to update series");
        return response.json();
      },
    }),

  deleteRecurring: () =>
    mutationOptions({
      mutationKey: ["sessions", "delete-recurring"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/recurring/${id}`,
          { method: "DELETE", credentials: "include" },
        );
        await throwIfNotOk(response, "Unable to delete series");
        return response.json();
      },
    }),
};
