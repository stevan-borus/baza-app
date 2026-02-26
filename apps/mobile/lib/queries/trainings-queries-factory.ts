import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const classTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxClients: z.number(),
  durationMins: z.number(),
});

const classTypesResponseSchema = z.object({
  success: z.boolean(),
  classTypes: z.array(classTypeSchema),
});

export type ClassType = z.infer<typeof classTypeSchema>;

export const trainingsQueries = {
  classTypes: () =>
    queryOptions({
      queryKey: ["trainings", "class-types"] as const,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainings/class-types`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to load class types (${response.status})`);
        return classTypesResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  createClassType: () =>
    mutationOptions({
      mutationKey: ["trainings", "class-types", "create"] as const,
      mutationFn: async (payload: { name: string; maxClients: number; durationMins: number }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainings/class-types`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error(`Unable to create class type (${response.status})`);
        return response.json();
      },
    }),
};
