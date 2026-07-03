import { queryOptions } from "@tanstack/react-query";
import { authMeResponseSchema } from "@baza/types/auth";
import { apiRequest } from "@/lib/api-request";

const authAll = ["auth"] as const;

export const authQueries = {
  all: authAll,
  me: () =>
    queryOptions({
      queryKey: [...authAll, "me"] as const,
      queryFn: () =>
        apiRequest("/api/auth/me", {
          schema: authMeResponseSchema,
          errorMessage: "Unable to load session",
        }),
      staleTime: 60_000,
    }),
};
