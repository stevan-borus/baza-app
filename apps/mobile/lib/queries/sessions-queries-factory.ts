import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { availabilityResponseSchema } from "@baza/types";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

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

export type Session = z.infer<typeof sessionSchema>;

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

  create: () =>
    mutationOptions({
      mutationKey: ["sessions", "create"] as const,
      mutationFn: async (payload: {
        classTypeId: string;
        roomId?: string;
        trainerUserId?: string;
        startsAt: string;
        endsAt: string;
        capacity: number;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create session (${response.status})`);
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
        trainerUserId?: string | null;
        status?: "SCHEDULED" | "CANCELED" | "COMPLETED";
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/sessions/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to update session (${response.status})`);
        return response.json();
      },
    }),

  createRecurring: () =>
    mutationOptions({
      mutationKey: ["sessions", "create-recurring"] as const,
      mutationFn: async (payload: {
        classTypeId: string;
        roomId?: string;
        trainerUserId?: string;
        startsAt: string;
        durationMins: number;
        capacity: number;
        repeatCount: number;
        repeatEveryDays?: number;
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
        if (!response.ok)
          throw new Error(`Unable to create recurring sessions (${response.status})`);
        return response.json();
      },
    }),
};
