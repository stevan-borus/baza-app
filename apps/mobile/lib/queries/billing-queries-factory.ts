import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { billingResponseSchema } from "@baza/types/billing";
import { apiRequest } from "@/lib/api-request";

export type { BillingRecord } from "@baza/types/billing";

function fetchBillingPage(
  cursor?: string | null,
  filters?: { clientUserId?: string; from?: string; to?: string },
) {
  return apiRequest("/api/billing", {
    params: {
      cursor,
      clientUserId: filters?.clientUserId,
      from: filters?.from,
      to: filters?.to,
    },
    schema: billingResponseSchema,
    errorMessage: "Unable to load billing",
  });
}

const billingAll = ["billing"] as const;

export const billingQueries = {
  all: billingAll,

  list: (cursor?: string) =>
    queryOptions({
      queryKey: [...billingAll, "list", cursor] as const,
      queryFn: () => fetchBillingPage(cursor),
      staleTime: 30_000,
    }),

  listInfinite: (filters?: { clientUserId?: string; from?: string; to?: string }) =>
    infiniteQueryOptions({
      // Spread into the key as primitives so React Query's deep-equal cache
      // lookup compares strings, not object references — avoids the bug where
      // the same logical filters produced a "new" cache miss every render but
      // changing values didn't always invalidate as expected.
      queryKey: [
        ...billingAll,
        "list-infinite",
        filters?.clientUserId ?? "",
        filters?.from ?? "",
        filters?.to ?? "",
      ] as const,
      queryFn: ({ pageParam }) => fetchBillingPage(pageParam, filters),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...billingAll, "create"] as const,
      mutationFn: async (payload: {
        clientUserId: string;
        amount: number;
        method: string;
        status?: string;
        notes?: string;
        packageTypeId?: string;
        activatePackageOnConfirm?: boolean;
      }) =>
        apiRequest("/api/billing", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to create billing record",
        }),
    }),
};

