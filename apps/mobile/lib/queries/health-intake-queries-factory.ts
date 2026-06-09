import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  healthIntakeInputSchema,
  healthIntakeResponseSchema,
  type HealthIntakeInput,
  type HealthIntakeResponse,
} from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";
import { consentQueries } from "@/lib/queries/consent-queries-factory";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/health-intake`;

const healthIntakeAll = ["health-intake"] as const;

export const healthIntakeQueries = {
  all: healthIntakeAll,
  /**
   * Returns the most-recent intake row for the current client, or `null`
   * when the endpoint reports 404 (no intake recorded yet).
   *
   * `staleTime: 0` because the value is consulted after every mutation
   * (record / withdraw) — we want the UI to reflect freshly-written state
   * without manual cache twiddling.
   */
  latest: () =>
    queryOptions({
      queryKey: [...healthIntakeAll, "latest"] as const,
      queryFn: async (): Promise<HealthIntakeResponse | null> => {
        const res = await apiFetch(BASE, { credentials: "include" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Unable to load intake (${res.status})`);
        const body = await res.json();
        // server returns `{ success: true, ...row }` — strip the wrapper key
        // before parsing the row shape itself
        const { success: _success, ...rest } = body as { success: boolean } & Record<string, unknown>;
        return healthIntakeResponseSchema.parse(rest);
      },
      staleTime: 0,
    }),
};

export function useRecordHealthIntakeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...healthIntakeAll, "record"] as const,
    mutationFn: async (input: HealthIntakeInput) => {
      const parsed = healthIntakeInputSchema.parse(input);
      const res = await apiFetch(BASE, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(`Record failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthIntakeQueries.all });
      queryClient.invalidateQueries({ queryKey: consentQueries.status().queryKey });
    },
  });
}

export function useWithdrawHealthIntakeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...healthIntakeAll, "withdraw"] as const,
    mutationFn: async () => {
      const res = await apiFetch(BASE, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`Withdraw failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthIntakeQueries.all });
    },
  });
}
