import {
  queryOptions,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  classTypeMutationResponseSchema,
  classTypesResponseSchema,
  type ClassType,
  type ClassTypeMutationResponse,
  type ClassTypesResponse,
} from "@baza/types/catalog";
import { apiRequest } from "@/lib/api-request";

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
      mutationFn: (payload: { name: string; maxClients: number; durationMins: number }) =>
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
      }: {
        id: string;
        name?: string;
        maxClients?: number;
        durationMins?: number;
      }) =>
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
// create/update return the full ClassType, so splice the returned row into the
// list cache instead of invalidating. Append on create, replace-by-id on update.

type ClassTypesListData = ClassTypesResponse;
const classTypesListKey = trainingsQueries.classTypes().queryKey;

function spliceClassType(queryClient: QueryClient, classType: ClassType) {
  queryClient.setQueryData<ClassTypesListData>(classTypesListKey, (prev) => {
    if (!prev) return prev;
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
    onSuccess: (data: ClassTypeMutationResponse) =>
      spliceClassType(queryClient, data.classType),
  };
}
