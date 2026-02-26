import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { clientsResponseSchema } from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

export const clientsQueries = {
  list: () =>
    queryOptions({
      queryKey: ["clients", "list"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load clients (${response.status})`);
        return clientsResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: ["clients", "create"] as const,
      mutationFn: async (payload: {
        email: string;
        fullName: string;
        phone?: string;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create client (${response.status})`);
        return response.json();
      },
    }),

  update: () =>
    mutationOptions({
      mutationKey: ["clients", "update"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        fullName?: string;
        phone?: string;
        notes?: string;
        isActive?: boolean;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to update client (${response.status})`);
        return response.json();
      },
    }),
};
