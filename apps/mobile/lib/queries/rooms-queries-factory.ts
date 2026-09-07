import {
  queryOptions,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  roomMutationResponseSchema,
  roomsResponseSchema,
  type Room,
  type RoomMutationResponse,
  type RoomsResponse,
} from "@baza/types/catalog";
import { apiRequest } from "@/lib/api-request";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { writeThroughList } from "@/lib/queries/write-through-list";

export type { Room } from "@baza/types/catalog";

const roomsAll = ["rooms"] as const;

export const roomsQueries = {
  all: roomsAll,
  list: () =>
    queryOptions({
      queryKey: [...roomsAll, "list"] as const,
      queryFn: () =>
        apiRequest("/api/rooms", {
          schema: roomsResponseSchema,
          errorMessage: "Unable to load rooms",
        }),
      staleTime: 60_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...roomsAll, "create"] as const,
      mutationFn: (payload: { name: string; capacity: number }) =>
        apiRequest("/api/rooms", {
          method: "POST",
          body: payload,
          schema: roomMutationResponseSchema,
          errorMessage: "Unable to create room",
        }),
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...roomsAll, "update"] as const,
      mutationFn: ({
        id,
        ...payload
      }: {
        id: string;
        name?: string;
        capacity?: number;
      }) =>
        apiRequest(`/api/rooms/${id}`, {
          method: "PATCH",
          body: payload,
          schema: roomMutationResponseSchema,
          errorMessage: "Unable to update room",
        }),
    }),

  delete: () =>
    mutationOptions({
      mutationKey: [...roomsAll, "delete"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/rooms/${id}`, {
          method: "DELETE",
          errorMessage: "Unable to delete room",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// create/update return the full Room (server widened in Layer 4), so the write
// goes straight into the list cache. Append on create (admin list is
// creation-ordered), replace-by-id on update. writeThroughList decides how: a
// warm list is spliced with no refetch, a cold one refetches once.

type RoomsListData = RoomsResponse;
const roomsListKey = roomsQueries.list().queryKey;

function spliceRoom(queryClient: QueryClient, room: Room) {
  return writeThroughList<RoomsListData>(queryClient, roomsListKey, (prev) => {
    const exists = prev.rooms.some((r) => r.id === room.id);
    const rooms = exists
      ? prev.rooms.map((r) => (r.id === room.id ? room : r))
      : [...prev.rooms, room];
    return { ...prev, rooms };
  });
}

export function createRoomMutationOptions(queryClient: QueryClient) {
  return {
    ...roomsQueries.create(),
    onSuccess: (data: RoomMutationResponse) => spliceRoom(queryClient, data.room),
  };
}

export function updateRoomMutationOptions(queryClient: QueryClient) {
  return {
    ...roomsQueries.update(),
    onSuccess: async (data: RoomMutationResponse) => {
      await Promise.all([
        spliceRoom(queryClient, data.room),
        // Session caches (availability/list/byId) embed a server-joined
        // roomName — a rename must refetch them or calendars keep the old name.
        queryClient.invalidateQueries({ queryKey: sessionsQueries.all }),
      ]);
    },
  };
}
