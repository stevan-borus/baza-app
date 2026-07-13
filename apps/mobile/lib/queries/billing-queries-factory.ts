import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { billingResponseSchema } from "@baza/types/billing";
import { apiRequest } from "@/lib/api-request";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";

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

  confirm: () =>
    mutationOptions({
      mutationKey: [...billingAll, "confirm"] as const,
      // PENDING → CONFIRMED once the client pays in person. Method may be
      // corrected at confirm time (promised cash, paid by card).
      mutationFn: async (payload: { id: string; method?: string }) =>
        apiRequest(`/api/billing/${payload.id}`, {
          method: "PATCH",
          body: { status: "CONFIRMED", method: payload.method },
          errorMessage: "Unable to confirm payment",
        }),
    }),
};

// A payment always changes the revenue figures (reports summary renders on
// the always-mounted Pregled), and with activatePackageOnConfirm the same
// transaction creates a ClientPackage — which flips the client's derived
// packageStatus under ["clients"]. Invalidate the superset unconditionally:
// billing writes are rare admin actions, the extra refetches are cheap.
export function createBillingMutationOptions(queryClient: QueryClient) {
  return {
    ...billingQueries.create(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billingQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
        queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
      ]);
    },
  };
}

export function useCreateBillingMutation() {
  return useMutation(createBillingMutationOptions(useQueryClient()));
}

// Confirming a pay-later payment moves revenue (reports), flips the row's
// badge (billing) and clears the "Nije plaćeno" tag on the client's package
// row (packages) — same superset as create, and just as rare an action.
export function confirmBillingMutationOptions(queryClient: QueryClient) {
  return {
    ...billingQueries.confirm(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billingQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
        queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
      ]);
    },
  };
}

export function useConfirmBillingMutation() {
  return useMutation(confirmBillingMutationOptions(useQueryClient()));
}

