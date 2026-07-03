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
// create/update return the full Room (server widened in Layer 4), so we splice
// the returned row into the list cache instead of invalidating (refetching).
// Append on create (admin list is creation-ordered), replace-by-id on update.

type RoomsListData = RoomsResponse;
const roomsListKey = roomsQueries.list().queryKey;

function spliceRoom(queryClient: QueryClient, room: Room) {
  queryClient.setQueryData<RoomsListData>(roomsListKey, (prev) => {
    if (!prev) return prev;
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
    onSuccess: (data: RoomMutationResponse) => spliceRoom(queryClient, data.room),
  };
}
