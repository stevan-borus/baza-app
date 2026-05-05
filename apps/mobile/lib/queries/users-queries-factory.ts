import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const trainerUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  role: z.enum(["ADMIN", "TRAINER"]),
});

const trainersResponseSchema = z.object({
  success: z.boolean(),
  users: z.array(trainerUserSchema),
});

export type TrainerUser = z.infer<typeof trainerUserSchema>;

export const usersQueries = {
  trainers: () =>
    queryOptions({
      queryKey: ["users", "trainers"] as const,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/users/trainers`,
          { credentials: "include" },
        );
        if (!response.ok)
          throw new Error(`Unable to load trainers (${response.status})`);
        return trainersResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),
};
