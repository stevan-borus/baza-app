import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { healthIntakeInputSchema, healthIntakeResponseSchema, type HealthIntakeInput, type HealthIntakeResponse } from "@baza/types/health-intake";
import { ApiError } from "@/lib/api-error";
import { apiRequest } from "@/lib/api-request";
import { consentQueries } from "@/lib/queries/consent-queries-factory";

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
        let body: unknown;
        try {
          body = await apiRequest("/api/health-intake", {
            errorMessage: "Unable to load intake",
          });
        } catch (error) {
          // 404 means "no intake recorded yet" — a valid empty state, not a failure.
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
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
    mutationFn: (input: HealthIntakeInput) =>
      apiRequest("/api/health-intake", {
        method: "POST",
        body: healthIntakeInputSchema.parse(input),
        errorMessage: "Record failed",
      }),
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
    mutationFn: () =>
      apiRequest("/api/health-intake", {
        method: "DELETE",
        errorMessage: "Withdraw failed",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthIntakeQueries.all });
    },
  });
}
