import { queryOptions, mutationOptions, infiniteQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, throwIfNotOk } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const trainerNoteSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  clientProfileId: z.string(),
  note: z.string(),
  createdAt: z.string(),
  trainer: z
    .object({
      id: z.string(),
      fullName: z.string(),
    })
    .optional(),
  clientProfile: z
    .object({
      user: z.object({
        id: z.string(),
        fullName: z.string(),
      }),
    })
    .optional(),
});

const trainerNotesResponseSchema = z.object({
  success: z.boolean(),
  notes: z.array(trainerNoteSchema),
  nextCursor: z.nullable(z.string()).optional(),
});

export type TrainerNote = z.infer<typeof trainerNoteSchema>;
type TrainerNotesResponse = z.infer<typeof trainerNotesResponseSchema>;

async function fetchNotesPage(
  params?: { sessionId?: string; clientProfileId?: string },
  cursor?: string | null,
): Promise<TrainerNotesResponse> {
  const qs = new URLSearchParams();
  if (params?.sessionId) qs.set("sessionId", params.sessionId);
  if (params?.clientProfileId) qs.set("clientProfileId", params.clientProfileId);
  if (cursor) qs.set("cursor", cursor);
  const query = qs.toString();
  const url = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainer-notes${query ? `?${query}` : ""}`;
  const response = await apiFetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Unable to load notes (${response.status})`);
  return trainerNotesResponseSchema.parse(await response.json());
}

export const trainerNotesQueries = {
  list: (params?: { sessionId?: string; clientProfileId?: string }) =>
    queryOptions({
      queryKey: ["trainer-notes", "list", params] as const,
      queryFn: () => fetchNotesPage(params),
      staleTime: 30_000,
    }),

  listInfinite: (params?: { sessionId?: string; clientProfileId?: string }) =>
    infiniteQueryOptions({
      queryKey: ["trainer-notes", "list-infinite", params] as const,
      queryFn: ({ pageParam }) => fetchNotesPage(params, pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: ["trainer-notes", "create"] as const,
      mutationFn: async (payload: {
        sessionId: string;
        clientProfileId: string;
        note: string;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainer-notes`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create note (${response.status})`);
        return response.json();
      },
    }),

  update: () =>
    mutationOptions({
      mutationKey: ["trainer-notes", "update"] as const,
      mutationFn: async ({ id, note }: { id: string; note: string }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainer-notes/${id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note }),
          },
        );
        await throwIfNotOk(response, "Unable to update note");
        return response.json();
      },
    }),

  delete: () =>
    mutationOptions({
      mutationKey: ["trainer-notes", "delete"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/trainer-notes/${id}`,
          { method: "DELETE", credentials: "include" },
        );
        await throwIfNotOk(response, "Unable to delete note");
        return response.json();
      },
    }),
};
