import { queryOptions } from "@tanstack/react-query";
import { trainersResponseSchema, type TrainerUser } from "@baza/types/common";
import { apiRequest } from "@/lib/api-request";

export type { TrainerUser };

const usersAll = ["users"] as const;

export const usersQueries = {
  all: usersAll,

  trainers: () =>
    queryOptions({
      queryKey: [...usersAll, "trainers"] as const,
      queryFn: () =>
        apiRequest("/api/users/trainers", {
          schema: trainersResponseSchema,
          errorMessage: "Unable to load trainers",
        }),
      staleTime: 60_000,
    }),
};
