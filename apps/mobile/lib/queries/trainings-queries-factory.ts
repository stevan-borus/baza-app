import {
  queryOptions,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  classTypeMutationResponseSchema,
  classTypesResponseSchema,
  classTypeInputSchema,
  updateClassTypeInputSchema,
  type ClassType,
  type ClassTypeMutationResponse,
  type ClassTypesResponse,
} from "@baza/types/catalog";
import { apiRequest } from "@/lib/api-request";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { writeThroughList } from "@/lib/queries/write-through-list";

export type { ClassType } from "@baza/types/catalog";

const trainingsAll = ["trainings"] as const;

export const trainingsQueries = {
  all: trainingsAll,
  classTypes: () =>
    queryOptions({
      queryKey: [...trainingsAll, "class-types"] as const,
      queryFn: () =>
        apiRequest("/api/trainings/class-types", {
          schema: classTypesResponseSchema,
          errorMessage: "Unable to load class types",
        }),
      staleTime: 60_000,
    }),

  createClassType: () =>
    mutationOptions({
      mutationKey: [...trainingsAll, "class-types", "create"] as const,
      mutationFn: (payload: z.input<typeof classTypeInputSchema>) =>
        apiRequest("/api/trainings/class-types", {
          method: "POST",
          body: payload,
          schema: classTypeMutationResponseSchema,
          errorMessage: "Unable to create class type",
        }),
    }),

  updateClassType: () =>
    mutationOptions({
      mutationKey: [...trainingsAll, "class-types", "update"] as const,
      mutationFn: ({
        id,
        ...payload
      }: { id: string } & z.input<typeof updateClassTypeInputSchema>) =>
        apiRequest(`/api/trainings/class-types/${id}`, {
          method: "PATCH",
          body: payload,
          schema: classTypeMutationResponseSchema,
          errorMessage: "Unable to update class type",
        }),
    }),

  deleteClassType: () =>
    mutationOptions({
      mutationKey: [...trainingsAll, "class-types", "delete"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/trainings/class-types/${id}`, {
          method: "DELETE",
          errorMessage: "Unable to delete class type",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// create/update return the full ClassType, so the write goes straight into the
// list cache. Append on create, replace-by-id on update. writeThroughList
// decides how: a warm list is spliced with no refetch, a cold one refetches
// once.

type ClassTypesListData = ClassTypesResponse;
const classTypesListKey = trainingsQueries.classTypes().queryKey;

function spliceClassType(queryClient: QueryClient, classType: ClassType) {
  return writeThroughList<ClassTypesListData>(queryClient, classTypesListKey, (prev) => {
    const exists = prev.classTypes.some((c) => c.id === classType.id);
    const classTypes = exists
      ? prev.classTypes.map((c) => (c.id === classType.id ? classType : c))
      : [...prev.classTypes, classType];
    return { ...prev, classTypes };
  });
}

export function createClassTypeMutationOptions(queryClient: QueryClient) {
  return {
    ...trainingsQueries.createClassType(),
    onSuccess: (data: ClassTypeMutationResponse) =>
      spliceClassType(queryClient, data.classType),
  };
}

export function updateClassTypeMutationOptions(queryClient: QueryClient) {
  return {
    ...trainingsQueries.updateClassType(),
    onSuccess: async (data: ClassTypeMutationResponse) => {
      await Promise.all([
        spliceClassType(queryClient, data.classType),
        // Session caches (availability/list/byId) embed a server-joined
        // classTypeName — a rename must refetch them or calendars keep the
        // old name and color mapping.
        queryClient.invalidateQueries({ queryKey: sessionsQueries.all }),
      ]);
    },
  };
}
