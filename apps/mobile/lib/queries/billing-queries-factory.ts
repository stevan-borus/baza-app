import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const billingRecordSchema = z.object({
  id: z.string(),
  clientUserId: z.string(),
  amount: z.number(),
  method: z.enum(["CASH", "CARD", "COMPANY", "QR", "MANUAL_ONLINE"]),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELED"]),
  notes: z.nullable(z.string()).optional(),
  createdAt: z.string(),
});

const billingResponseSchema = z.object({
  success: z.boolean(),
  records: z.array(billingRecordSchema),
  nextCursor: z.nullable(z.string()).optional(),
});

export type BillingRecord = z.infer<typeof billingRecordSchema>;

async function fetchBillingPage(
  cursor?: string | null,
  filters?: { clientUserId?: string; from?: string; to?: string },
) {
  const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/billing`;
  const searchParams = new URLSearchParams();
  if (cursor) searchParams.set("cursor", cursor);
  if (filters?.clientUserId) searchParams.set("clientUserId", filters.clientUserId);
  if (filters?.from) searchParams.set("from", filters.from);
  if (filters?.to) searchParams.set("to", filters.to);
  // Don't use `searchParams.size` — RN's URLSearchParams polyfill returns
  // `undefined` for it, so `size > 0` is always false and the query string
  // gets dropped. `toString()` returns the empty string when no params are
  // set, which we can check directly.
  const qs = searchParams.toString();
  const url = qs ? `${endpoint}?${qs}` : endpoint;
  const response = await apiFetch(url, { credentials: "include" });
  if (!response.ok)
    throw new Error(`Unable to load billing (${response.status})`);
  return billingResponseSchema.parse(await response.json());
}

export const billingQueries = {
  list: (cursor?: string) =>
    queryOptions({
      queryKey: ["billing", "list", cursor] as const,
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
        "billing",
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
      mutationKey: ["billing", "create"] as const,
      mutationFn: async (payload: {
        clientUserId: string;
        amount: number;
        method: string;
        status?: string;
        notes?: string;
        packageTypeId?: string;
        activatePackageOnConfirm?: boolean;
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/billing`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok)
          throw new Error(
            `Unable to create billing record (${response.status})`,
          );
        return response.json();
      },
    }),
};

