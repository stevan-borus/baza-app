import { queryOptions } from "@tanstack/react-query";
import { trainersResponseSchema, type TrainerUser } from "@baza/types/common";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

export type { TrainerUser };

const usersAll = ["users"] as const;

export const usersQueries = {
  all: usersAll,

  trainers: () =>
    queryOptions({
      queryKey: [...usersAll, "trainers"] as const,
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
