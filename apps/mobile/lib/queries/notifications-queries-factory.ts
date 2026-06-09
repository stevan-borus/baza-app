import { queryOptions, mutationOptions, infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
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
      mutationKey: [...notificationsAll, "mark-read-batch"] as const,
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
      queryKey: [...notificationsAll, "preferences"] as const,
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
      mutationKey: [...notificationsAll, "push-token"] as const,
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
      mutationKey: [...notificationsAll, "push-token", "unregister"] as const,
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
      mutationKey: [...notificationsAll, "preferences", "update"] as const,
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

export function useUpdatePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    ...notificationsQueries.updatePreferences(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    },
  });
}
