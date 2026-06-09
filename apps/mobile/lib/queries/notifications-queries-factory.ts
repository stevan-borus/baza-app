import { queryOptions, mutationOptions, infiniteQueryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const jsonValueSchema: z.ZodType<string | number | boolean | null | Record<string, string | number | boolean | null> | Array<string | number | boolean | null>> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ]),
);

const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), jsonValueSchema).nullable().optional(),
  readAt: z.nullable(z.string()),
  createdAt: z.string(),
});

const notificationsResponseSchema = z.object({
  success: z.boolean(),
  notifications: z.array(notificationSchema),
  nextCursor: z.nullable(z.string()).optional(),
});

const preferencesSchema = z.object({
  pushEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  campaignsEnabled: z.boolean(),
  bookingEmailsEnabled: z.boolean(),
  preferredLocale: z.string().nullable().optional(),
});

const preferencesResponseSchema = z.object({
  success: z.boolean(),
  preferences: preferencesSchema,
});

export type Notification = z.infer<typeof notificationSchema>;
type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

async function fetchNotificationsPage(cursor?: string | null): Promise<NotificationsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const url = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications${query}`;
  const response = await apiFetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Unable to load notifications (${response.status})`);
  return notificationsResponseSchema.parse(await response.json());
}

export const notificationsQueries = {
  list: (cursor?: string) =>
    queryOptions({
      queryKey: ["notifications", "list", cursor] as const,
      queryFn: () => fetchNotificationsPage(cursor),
      staleTime: 15_000,
    }),

  listInfinite: () =>
    infiniteQueryOptions({
      queryKey: ["notifications", "list-infinite"] as const,
      queryFn: ({ pageParam }) => fetchNotificationsPage(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 15_000,
    }),

  markAsRead: () =>
    mutationOptions({
      mutationKey: ["notifications", "mark-read"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications/${id}`,
          { method: "PATCH", credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to mark notification as read (${response.status})`);
        return response.json();
      },
    }),

  markManyRead: () =>
    mutationOptions({
      mutationKey: ["notifications", "mark-read-batch"] as const,
      mutationFn: async (ids: string[]) => {
        if (ids.length === 0) return { success: true, count: 0 };
        // PATCH on the collection endpoint — a sibling `/mark-read` subpath
        // gets shadowed by the dynamic `[id]/+api.ts` matcher.
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids }),
          },
        );
        if (!response.ok) throw new Error(`Unable to mark notifications as read (${response.status})`);
        return response.json();
      },
    }),

  preferences: () =>
    queryOptions({
      queryKey: ["notifications", "preferences"] as const,
      queryFn: async () => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications/preferences`,
          { credentials: "include" },
        );
        if (!response.ok)
          throw new Error(`Unable to load notification preferences (${response.status})`);
        return preferencesResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  registerPushToken: () =>
    mutationOptions({
      mutationKey: ["notifications", "push-token"] as const,
      mutationFn: async (payload: {
        deviceId: string;
        expoPushToken: string;
        preferredLocale?: "sr" | "en";
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications/push-token`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error(`Unable to register push token (${response.status})`);
        return response.json();
      },
    }),

  unregisterPushToken: () =>
    mutationOptions({
      mutationKey: ["notifications", "push-token", "unregister"] as const,
      mutationFn: async (payload?: { deviceId?: string; expoPushToken?: string }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications/push-token`,
          {
            method: "DELETE",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload ?? {}),
          },
        );
        if (!response.ok) {
          throw new Error(`Unable to unregister push token (${response.status})`);
        }
        return response.json();
      },
    }),

  updatePreferences: () =>
    mutationOptions({
      mutationKey: ["notifications", "preferences", "update"] as const,
      mutationFn: async (payload: {
        pushEnabled?: boolean;
        inAppEnabled?: boolean;
        campaignsEnabled?: boolean;
        bookingEmailsEnabled?: boolean;
        preferredLocale?: "sr" | "en" | null;
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications/preferences`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error(`Unable to update preferences (${response.status})`);
        return response.json();
      },
    }),
};

type PreferencesResponse = z.infer<typeof preferencesResponseSchema>;
type UpdatePreferencesInput = {
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  campaignsEnabled?: boolean;
  bookingEmailsEnabled?: boolean;
  preferredLocale?: "sr" | "en" | null;
};

const PREFERENCES_KEY = ["notifications", "preferences"] as const;

/**
 * Optimistic update options for the preferences PATCH.
 *
 * Why onMutate (not just the component's mutation.variables read): the settings
 * screen's optimistic read only holds while the mutation isPending. The instant
 * the PATCH settles, isPending flips false but the onSuccess invalidation's
 * refetch hasn't returned yet — so without a cache write the switch reads the
 * stale pre-tap value and visibly snaps back (the reported left-right jitter).
 * Writing the flipped value into the cache here keeps it authoritative across
 * the whole settle→refetch window; onError rolls it back on failure.
 */
export function updatePreferencesMutationOptions(queryClient: QueryClient) {
  return {
    ...notificationsQueries.updatePreferences(),
    onMutate: async (input: UpdatePreferencesInput) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });
      const previous = queryClient.getQueryData<PreferencesResponse>(PREFERENCES_KEY);
      if (previous) {
        // Merge whatever single field this PATCH carries (a toggle, or the
        // locale) onto the cached preferences so the optimistic value is exact.
        queryClient.setQueryData<PreferencesResponse>(PREFERENCES_KEY, {
          ...previous,
          preferences: { ...previous.preferences, ...input },
        });
      }
      return { previous };
    },
    onError: (_err: unknown, _input: UpdatePreferencesInput, context?: { previous?: PreferencesResponse }) => {
      if (context?.previous) {
        queryClient.setQueryData(PREFERENCES_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
    },
  };
}

export function useUpdatePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation(updatePreferencesMutationOptions(queryClient));
}
