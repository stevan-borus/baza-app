import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  adminClientConsentRecordsResponseSchema,
  adminClientHealthResponseSchema,
  clientByIdResponseSchema,
  clientsResponseSchema,
} from "@baza/types";
import { ApiError } from "@/lib/api-error";
import { apiRequest } from "@/lib/api-request";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";

export class ClientForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "ClientForbiddenError";
  }
}

const DEFAULT_TAKE = 20;

const clientsAll = ["clients"] as const;

export const clientsQueries = {
  all: clientsAll,

  /**
   * Cursor-paginated client list with optional server-side substring search.
   *
   * Why this shape: every consumer of the old `useQuery(clientsQueries.list())`
   * rendered all rows in one ScrollView and filtered client-side. With ~1000
   * clients that's 1000 rows mounted at once and an O(n) filter on every
   * keystroke. The infinite-query variant keeps the page size manageable
   * and lets each consumer pass `q` so the search happens in Postgres.
   *
   * Page params are the opaque `nextCursor` returned by the API (the last
   * clientProfile.id on the page). `null` means "first page".
   */
  list: (opts: { q?: string; take?: number } = {}) =>
    infiniteQueryOptions({
      queryKey: [
        ...clientsAll,
        "list",
        { q: opts.q ?? "", take: opts.take ?? DEFAULT_TAKE },
      ] as const,
      queryFn: ({ pageParam }) =>
        apiRequest("/api/clients", {
          params: { cursor: pageParam, q: opts.q, take: opts.take ?? DEFAULT_TAKE },
          schema: clientsResponseSchema,
          errorMessage: "Unable to load clients",
        }),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor ?? null,
      staleTime: 60_000,
    }),

  byId: (id: string) =>
    queryOptions({
      queryKey: [...clientsAll, "byId", id] as const,
      queryFn: async () => {
        try {
          return await apiRequest(`/api/clients/${id}`, {
            schema: clientByIdResponseSchema,
            errorMessage: "Unable to load client",
          });
        } catch (e) {
          if (e instanceof ApiError && e.status === 403)
            throw new ClientForbiddenError();
          throw e;
        }
      },
      retry: (_count, error) =>
        error instanceof ClientForbiddenError ? false : true,
      staleTime: 60_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...clientsAll, "create"] as const,
      mutationFn: async (payload: {
        email: string;
        firstName: string;
        lastName: string;
        phone?: string;
        // Required by the server (inviteClientInputSchema) for the
        // minor/guardian waiver logic; ISO yyyy-mm-dd.
        dateOfBirth: string;
      }) =>
        apiRequest("/api/clients", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to create client",
        }),
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...clientsAll, "update"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        notes?: string;
        isActive?: boolean;
        dateOfBirth?: string | null;
      }) =>
        apiRequest(`/api/clients/${id}`, {
          method: "PATCH",
          body: payload,
          errorMessage: "Unable to update client",
        }),
    }),

  consentRecords: (clientUserId: string) =>
    queryOptions({
      queryKey: [...clientsAll, clientUserId, "consent-records"] as const,
      queryFn: () =>
        apiRequest(`/api/admin/clients/${clientUserId}/consent-records`, {
          schema: adminClientConsentRecordsResponseSchema,
          errorMessage: "Unable to load consent records",
        }),
      staleTime: 30_000,
    }),

  health: (clientUserId: string) =>
    queryOptions({
      queryKey: [...clientsAll, clientUserId, "health"] as const,
      queryFn: () =>
        apiRequest(`/api/admin/clients/${clientUserId}/health`, {
          schema: adminClientHealthResponseSchema,
          errorMessage: "Unable to load health",
        }),
      staleTime: 30_000,
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// Client writes also invalidate ["reports"]: the summary's totalClients /
// activeClients counts render on the always-mounted Pregled, and create and
// the isActive toggle (edit + soft-delete) both move those counts.

export function createClientMutationOptions(queryClient: QueryClient) {
  return {
    ...clientsQueries.create(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
      ]);
    },
  };
}

export function updateClientMutationOptions(queryClient: QueryClient) {
  return {
    ...clientsQueries.update(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
      ]);
    },
  };
}
