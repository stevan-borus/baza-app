import { queryOptions, type QueryClient } from "@tanstack/react-query";
import {
  confirmTrialResponseSchema,
  createPayrollAdjustmentResponseSchema,
  createTrainerRateResponseSchema,
  payrollMonthResponseSchema,
  payrollSummaryResponseSchema,
  trainerRatesResponseSchema,
} from "@baza/types/payroll";
import { apiRequest } from "@/lib/api-request";

const payrollAll = ["payroll"] as const;

export const payrollQueries = {
  all: payrollAll,

  /**
   * One trainer's month. Omitting `trainerUserId` asks for "my own", which is
   * the only form a TRAINER may use — the server takes the id from the session
   * rather than trusting the query string.
   */
  month: (params: { year: number; month: number; trainerUserId?: string }) =>
    queryOptions({
      queryKey: [
        ...payrollAll,
        "month",
        params.year,
        params.month,
        params.trainerUserId ?? "me",
      ] as const,
      queryFn: () =>
        apiRequest("/api/payroll/month", {
          params: {
            year: String(params.year),
            month: String(params.month),
            trainerUserId: params.trainerUserId,
          },
          schema: payrollMonthResponseSchema,
          errorMessage: "Unable to load payroll",
        }),
      staleTime: 60_000,
    }),

  summary: (params: { year: number; month: number }) =>
    queryOptions({
      queryKey: [...payrollAll, "summary", params.year, params.month] as const,
      queryFn: () =>
        apiRequest("/api/payroll/summary", {
          params: { year: String(params.year), month: String(params.month) },
          schema: payrollSummaryResponseSchema,
          errorMessage: "Unable to load payroll summary",
        }),
      staleTime: 60_000,
    }),

  rates: (params?: { trainerUserId?: string }) =>
    queryOptions({
      queryKey: [...payrollAll, "rates", params?.trainerUserId ?? "all"] as const,
      queryFn: () =>
        apiRequest("/api/payroll/rates", {
          params: { trainerUserId: params?.trainerUserId },
          schema: trainerRatesResponseSchema,
          errorMessage: "Unable to load trainer rates",
        }),
      staleTime: 60_000,
    }),

  createRate: () => ({
    mutationFn: (input: {
      trainerUserId: string;
      /** Null ends a class-type override — only valid alongside classTypeId. */
      percent: number | null;
      /** Omitted = the trainer's default rate. */
      classTypeId?: string;
      effectiveFrom: string;
      note?: string;
    }) =>
      apiRequest("/api/payroll/rates", {
        method: "POST",
        body: input,
        schema: createTrainerRateResponseSchema,
        errorMessage: "Unable to save the rate",
      }),
  }),

  /**
   * Value a trial (probni) attendance at the class type's trial value. Takes
   * the BOOKING id — a frozen line is identified by its consumption instead,
   * and is never confirmable.
   */
  confirmTrial: () => ({
    mutationFn: (input: { bookingId: string }) =>
      apiRequest(`/api/bookings/${input.bookingId}/confirm-trial`, {
        method: "POST",
        schema: confirmTrialResponseSchema,
        errorMessage: "Unable to confirm the trial attendance",
      }),
  }),

  createAdjustment: () => ({
    mutationFn: (input: {
      trainerUserId: string;
      year: number;
      month: number;
      amount: number;
      note: string;
    }) =>
      apiRequest("/api/payroll/adjustments", {
        method: "POST",
        body: input,
        schema: createPayrollAdjustmentResponseSchema,
        errorMessage: "Unable to save the adjustment",
      }),
  }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// Every payroll mutation changes a figure that another payroll screen is
// already showing (the summary totals, the month breakdown, the rate list), so
// they all invalidate the whole ["payroll"] tree rather than surgically
// patching caches that would drift apart.

export function createTrainerRateMutationOptions(queryClient: QueryClient) {
  return {
    ...payrollQueries.createRate(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollAll }),
  };
}

export function confirmTrialMutationOptions(queryClient: QueryClient) {
  return {
    ...payrollQueries.confirmTrial(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollAll }),
  };
}

export function createPayrollAdjustmentMutationOptions(queryClient: QueryClient) {
  return {
    ...payrollQueries.createAdjustment(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollAll }),
  };
}
