import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, throwIfNotOk } from "@/lib/api";
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

const trainingsAll = ["trainings"] as const;

export const trainingsQueries = {
  all: trainingsAll,
  classTypes: () =>
    queryOptions({
      queryKey: [...trainingsAll, "class-types"] as const,
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
      mutationKey: [...trainingsAll, "class-types", "create"] as const,
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

  updateClassType: () =>
    mutationOptions({
      mutationKey: [...trainingsAll, "class-types", "update"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        name?: string;
        maxClients?: number;
        durationMins?: number;
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainings/class-types/${id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        await throwIfNotOk(response, "Unable to update class type");
        return response.json();
      },
    }),

  deleteClassType: () =>
    mutationOptions({
      mutationKey: [...trainingsAll, "class-types", "delete"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainings/class-types/${id}`,
          { method: "DELETE", credentials: "include" },
        );
        await throwIfNotOk(response, "Unable to delete class type");
        return response.json();
      },
    }),
};
