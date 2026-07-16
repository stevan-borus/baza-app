import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  trainerNotesResponseSchema,
  type TrainerNotesResponse,
} from "@baza/types/trainer-notes";
import { apiRequest } from "@/lib/api-request";

export type { TrainerNote } from "@baza/types/trainer-notes";

type NotesListParams = {
  sessionId?: string;
  clientProfileId?: string;
  /** Multi-select filter; sent server-side as a comma-separated `sessionIds` param. */
  sessionIds?: readonly string[];
  /** Multi-select filter; sent server-side as a comma-separated `clientProfileIds` param. */
  clientProfileIds?: readonly string[];
  take?: number;
};

function fetchNotesPage(
  params?: NotesListParams,
  cursor?: string | null,
): Promise<TrainerNotesResponse> {
  return apiRequest("/api/trainer-notes", {
    params: {
      sessionId: params?.sessionId,
      clientProfileId: params?.clientProfileId,
      // Multi-selects go over the wire comma-separated; empty arrays are omitted.
      sessionIds: params?.sessionIds,
      clientProfileIds: params?.clientProfileIds,
      take: params?.take,
      cursor,
    },
    schema: trainerNotesResponseSchema,
    errorMessage: "Unable to load notes",
  });
}

// Keep array params in queryKey order-stable so identical sets hit the same
// cache entry regardless of insertion order. Sets in React state don't have
// a stable iteration order across renders, so we sort here.
function stableKey(p?: NotesListParams) {
  if (!p) return undefined;
  return {
    sessionId: p.sessionId,
    clientProfileId: p.clientProfileId,
    sessionIds: p.sessionIds ? [...p.sessionIds].sort() : undefined,
    clientProfileIds: p.clientProfileIds ? [...p.clientProfileIds].sort() : undefined,
    take: p.take,
  };
}

const trainerNotesAll = ["trainer-notes"] as const;

export const trainerNotesQueries = {
  all: trainerNotesAll,

  list: (params?: NotesListParams) =>
    queryOptions({
      queryKey: [...trainerNotesAll, "list", stableKey(params)] as const,
      queryFn: () => fetchNotesPage(params),
      staleTime: 30_000,
    }),

  listInfinite: (params?: NotesListParams) =>
    infiniteQueryOptions({
      queryKey: [...trainerNotesAll, "list-infinite", stableKey(params)] as const,
      queryFn: ({ pageParam }) => fetchNotesPage(params, pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...trainerNotesAll, "create"] as const,
      mutationFn: async (payload: {
        sessionId?: string;
        clientProfileId: string;
        note: string;
      }) =>
        apiRequest("/api/trainer-notes", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to create note",
        }),
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...trainerNotesAll, "update"] as const,
      mutationFn: ({ id, note }: { id: string; note: string }) =>
        apiRequest(`/api/trainer-notes/${id}`, {
          method: "PATCH",
          body: { note },
          errorMessage: "Unable to update note",
        }),
    }),

  delete: () =>
    mutationOptions({
      mutationKey: [...trainerNotesAll, "delete"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/trainer-notes/${id}`, {
          method: "DELETE",
          errorMessage: "Unable to delete note",
        }),
    }),
};

// Standard delete-note mutation with cache upkeep baked in: a deleted note must
// drop off every notes list (session-detail, client beleske tab), so we
// invalidate the whole trainer-notes tree on success.
export function deleteTrainerNoteMutationOptions(queryClient: QueryClient) {
  return {
    ...trainerNotesQueries.delete(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainerNotesQueries.all });
    },
  };
}

export function useDeleteTrainerNoteMutation() {
  return useMutation(deleteTrainerNoteMutationOptions(useQueryClient()));
}
