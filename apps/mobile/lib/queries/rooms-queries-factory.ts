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
import { apiFetch, throwIfNotOk } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

export type { Room } from "@baza/types/catalog";

const roomsAll = ["rooms"] as const;

export const roomsQueries = {
  all: roomsAll,
  list: () =>
    queryOptions({
      queryKey: [...roomsAll, "list"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/rooms`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load rooms (${response.status})`);
        return roomsResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...roomsAll, "create"] as const,
      mutationFn: async (payload: { name: string; capacity: number }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/rooms`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create room (${response.status})`);
        return roomMutationResponseSchema.parse(await response.json());
      },
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...roomsAll, "update"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        name?: string;
        capacity?: number;
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/rooms/${id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        await throwIfNotOk(response, "Unable to update room");
        return roomMutationResponseSchema.parse(await response.json());
      },
    }),

  delete: () =>
    mutationOptions({
      mutationKey: [...roomsAll, "delete"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/rooms/${id}`,
          { method: "DELETE", credentials: "include" },
        );
        await throwIfNotOk(response, "Unable to delete room");
        return response.json();
      },
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
    onSuccess: async (data: RoomMutationResponse) => {
      spliceRoom(queryClient, data.room);
      // Session caches (availability/list/byId) embed a server-joined
      // roomName — a rename must refetch them or calendars keep the old name.
      await queryClient.invalidateQueries({ queryKey: sessionsQueries.all });
    },
  };
}
