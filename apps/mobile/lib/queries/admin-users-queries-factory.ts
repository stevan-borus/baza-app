import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  adminUsersResponseSchema,
  unlockUserResponseSchema,
  type AdminUser,
} from "@baza/types/admin-users";
import { apiRequest } from "@/lib/api-request";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

export type { AdminUser };

const adminUsersAll = ["admin-users"] as const;

export const adminUsersQueries = {
  all: adminUsersAll,

  /** Active staff (TRAINER + ADMIN) with their current sign-in lock. */
  list: () =>
    queryOptions({
      queryKey: [...adminUsersAll, "list"] as const,
      queryFn: () =>
        apiRequest("/api/admin/users", {
          schema: adminUsersResponseSchema,
          errorMessage: "Unable to load users",
        }),
      staleTime: 60_000,
    }),

  unlock: () =>
    mutationOptions({
      mutationKey: [...adminUsersAll, "unlock"] as const,
      mutationFn: ({ id }: { id: string }) =>
        apiRequest(`/api/admin/users/${id}/unlock`, {
          method: "POST",
          schema: unlockUserResponseSchema,
          errorMessage: "Unable to unlock user",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────

/**
 * An unlock also invalidates ["clients"]: the padlock renders on two screens
 * from two different caches — the staff roster here, and the client-detail
 * payload under `clientsQueries.byId`, which carries `user.lockedUntil` for
 * CLIENT users. Invalidating only the roster leaves the client profile
 * showing a lock the server has already lifted.
 */
export function unlockUserMutationOptions(queryClient: QueryClient) {
  return {
    ...adminUsersQueries.unlock(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminUsersQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
      ]);
    },
  };
}

export function useUnlockUserMutation() {
  return useMutation(unlockUserMutationOptions(useQueryClient()));
}
