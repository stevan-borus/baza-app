import { queryOptions } from "@tanstack/react-query";
import { authMeResponseSchema } from "@baza/types/auth";
import { sharedEnv } from "@/lib/env.shared";
import { apiFetch } from "@/lib/api";

const authAll = ["auth"] as const;

export const authQueries = {
  all: authAll,
  me: () =>
    queryOptions({
      queryKey: [...authAll, "me"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/auth/me`);
        if (!response.ok) {
          throw new Error(`Unable to load session (${response.status})`);
        }
        const payload = await response.json();
        return authMeResponseSchema.parse(payload);
      },
      staleTime: 60_000,
    }),
};
