import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number(),
});

const roomsResponseSchema = z.object({
  success: z.boolean(),
  rooms: z.array(roomSchema),
});

export type Room = z.infer<typeof roomSchema>;

export const roomsQueries = {
  list: () =>
    queryOptions({
      queryKey: ["rooms", "list"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/rooms`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load rooms (${response.status})`);
        return roomsResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: ["rooms", "create"] as const,
      mutationFn: async (payload: { name: string; capacity: number }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/rooms`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create room (${response.status})`);
        return response.json();
      },
    }),
};
