import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { clientByIdResponseSchema, clientsResponseSchema } from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

export class ClientForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "ClientForbiddenError";
  }
}

const DEFAULT_TAKE = 20;

export const clientsQueries = {
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
        "clients",
        "list",
        { q: opts.q ?? "", take: opts.take ?? DEFAULT_TAKE },
      ] as const,
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams();
        if (pageParam) params.set("cursor", pageParam);
        if (opts.q) params.set("q", opts.q);
        params.set("take", String(opts.take ?? DEFAULT_TAKE));
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients?${params.toString()}`,
          { credentials: "include" },
        );
        if (!response.ok)
          throw new Error(`Unable to load clients (${response.status})`);
        return clientsResponseSchema.parse(await response.json());
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor ?? null,
      staleTime: 60_000,
    }),

  byId: (id: string) =>
    queryOptions({
      queryKey: ["clients", "byId", id] as const,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients/${id}`,
          { credentials: "include" },
        );
        if (response.status === 403) throw new ClientForbiddenError();
        if (!response.ok) throw new Error(`Unable to load client (${response.status})`);
        return clientByIdResponseSchema.parse(await response.json());
      },
      retry: (_count, error) =>
        error instanceof ClientForbiddenError ? false : true,
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
        dateOfBirth?: string | null;
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

  consentRecords: (clientUserId: string) =>
    queryOptions({
      queryKey: ["clients", clientUserId, "consent-records"] as const,
      queryFn: async () => {
        const res = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/admin/clients/${clientUserId}/consent-records`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`Unable to load consent records (${res.status})`);
        return res.json() as Promise<{
          records: Array<{
            id: string;
            documentKey: string;
            version: number;
            acceptedAt: string;
            guardianVerifiedAt: string | null;
          }>;
        }>;
      },
      staleTime: 30_000,
    }),

  health: (clientUserId: string) =>
    queryOptions({
      queryKey: ["clients", clientUserId, "health"] as const,
      queryFn: async () => {
        const res = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/admin/clients/${clientUserId}/health`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`Unable to load health (${res.status})`);
        return res.json() as Promise<{
          success: boolean;
          intake: {
            id: string;
            isPregnant: boolean;
            isPostpartum: boolean;
            hasComplaints: boolean;
            complaintsDetails: string | null;
            hasInjuries: boolean;
            injuriesDetails: string | null;
            recordedAt: string;
          } | null;
          withdrawnAt: string | null;
        }>;
      },
      staleTime: 30_000,
    }),
};
