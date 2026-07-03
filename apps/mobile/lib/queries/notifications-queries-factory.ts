import { queryOptions, mutationOptions, infiniteQueryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  notificationPreferencesResponseSchema,
  notificationsResponseSchema,
  type NotificationPreferencesResponse,
  type NotificationsResponse,
} from "@baza/types/notifications";
import { apiRequest } from "@/lib/api-request";

export type { Notification } from "@baza/types/notifications";

function fetchNotificationsPage(cursor?: string | null): Promise<NotificationsResponse> {
  return apiRequest("/api/notifications", {
    params: { cursor },
    schema: notificationsResponseSchema,
    errorMessage: "Unable to load notifications",
  });
}

const notificationsAll = ["notifications"] as const;

export const notificationsQueries = {
  all: notificationsAll,

  list: (cursor?: string) =>
    queryOptions({
      queryKey: [...notificationsAll, "list", cursor] as const,
      queryFn: () => fetchNotificationsPage(cursor),
      staleTime: 15_000,
    }),

  listInfinite: () =>
    infiniteQueryOptions({
      queryKey: [...notificationsAll, "list-infinite"] as const,
      queryFn: ({ pageParam }) => fetchNotificationsPage(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 15_000,
    }),

  markAsRead: () =>
    mutationOptions({
      mutationKey: [...notificationsAll, "mark-read"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/notifications/${id}`, {
          method: "PATCH",
          errorMessage: "Unable to mark notification as read",
        }),
    }),

  markManyRead: () =>
    mutationOptions({
      mutationKey: [...notificationsAll, "mark-read-batch"] as const,
      mutationFn: async (ids: string[]) => {
        if (ids.length === 0) return { success: true, count: 0 };
        // PATCH on the collection endpoint — a sibling `/mark-read` subpath
        // gets shadowed by the dynamic `[id]/+api.ts` matcher.
        return apiRequest("/api/notifications", {
          method: "PATCH",
          body: { ids },
          errorMessage: "Unable to mark notifications as read",
        });
      },
    }),

  preferences: () =>
    queryOptions({
      queryKey: [...notificationsAll, "preferences"] as const,
      queryFn: () =>
        apiRequest("/api/notifications/preferences", {
          schema: notificationPreferencesResponseSchema,
          errorMessage: "Unable to load notification preferences",
        }),
      staleTime: 60_000,
    }),

  registerPushToken: () =>
    mutationOptions({
      mutationKey: [...notificationsAll, "push-token"] as const,
      mutationFn: async (payload: {
        deviceId: string;
        expoPushToken: string;
        preferredLocale?: "sr" | "en";
      }) =>
        apiRequest("/api/notifications/push-token", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to register push token",
        }),
    }),

  unregisterPushToken: () =>
    mutationOptions({
      mutationKey: [...notificationsAll, "push-token", "unregister"] as const,
      mutationFn: (payload?: { deviceId?: string; expoPushToken?: string }) =>
        apiRequest("/api/notifications/push-token", {
          method: "DELETE",
          body: payload ?? {},
          errorMessage: "Unable to unregister push token",
        }),
    }),

  updatePreferences: () =>
    mutationOptions({
      mutationKey: [...notificationsAll, "preferences", "update"] as const,
      mutationFn: async (payload: {
        pushEnabled?: boolean;
        inAppEnabled?: boolean;
        campaignsEnabled?: boolean;
        bookingEmailsEnabled?: boolean;
        preferredLocale?: "sr" | "en" | null;
      }) =>
        apiRequest("/api/notifications/preferences", {
          method: "PATCH",
          body: payload,
          errorMessage: "Unable to update preferences",
        }),
    }),
};

type PreferencesResponse = NotificationPreferencesResponse;
type UpdatePreferencesInput = {
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  campaignsEnabled?: boolean;
  bookingEmailsEnabled?: boolean;
  preferredLocale?: "sr" | "en" | null;
};

/**
 * Optimistic update options for the preferences PATCH.
 *
 * onMutate writes the flipped value straight into the preferences cache so the
 * switch shows the new position instantly and holds it — fixing the left-right
 * snap-back that came from reading the stale cache during the old settle→refetch
 * window. onError reverts to the pre-tap snapshot if the PATCH fails.
 *
 * No onSuccess/onSettled invalidation: the optimistic write is already the
 * server-confirmed value once the PATCH resolves, so re-fetching would only add
 * a redundant round-trip (and reopen a refetch window) to learn what we know.
 */
export function updatePreferencesMutationOptions(queryClient: QueryClient) {
  const preferencesKey = notificationsQueries.preferences().queryKey;
  return {
    ...notificationsQueries.updatePreferences(),
    onMutate: async (input: UpdatePreferencesInput) => {
      await queryClient.cancelQueries({ queryKey: preferencesKey });
      const previous = queryClient.getQueryData<PreferencesResponse>(preferencesKey);
      if (previous) {
        // Merge whatever single field this PATCH carries (a toggle, or the
        // locale) onto the cached preferences so the optimistic value is exact.
        queryClient.setQueryData<PreferencesResponse>(preferencesKey, {
          ...previous,
          preferences: { ...previous.preferences, ...input },
        });
      }
      return { previous };
    },
    onError: (_err: unknown, _input: UpdatePreferencesInput, context?: { previous?: PreferencesResponse }) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesKey, context.previous);
      }
    },
  };
}

export function useUpdatePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation(updatePreferencesMutationOptions(queryClient));
}
