import {
  queryOptions,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const inviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  phone: z.nullable(z.string()).optional(),
  status: z.enum(["PENDING", "COMPLETED", "REVOKED", "EXPIRED"]),
  createdAt: z.string(),
});

const invitesResponseSchema = z.object({
  success: z.boolean(),
  invites: z.array(inviteSchema),
});

const inviteMutationResponseSchema = z.object({
  success: z.boolean(),
  invite: inviteSchema,
});

export type Invite = z.infer<typeof inviteSchema>;

const invitesAll = ["invites"] as const;

export const invitesQueries = {
  all: invitesAll,

  list: () =>
    queryOptions({
      queryKey: [...invitesAll, "list"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load invites (${response.status})`);
        return invitesResponseSchema.parse(await response.json());
      },
      staleTime: 30_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...invitesAll, "create"] as const,
      mutationFn: async (payload: { email: string; firstName: string; lastName: string; phone?: string; dateOfBirth?: string }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create invite (${response.status})`);
        return inviteMutationResponseSchema.parse(await response.json());
      },
    }),

  revoke: () =>
    mutationOptions({
      mutationKey: [...invitesAll, "revoke"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites/${id}/revoke`,
          { method: "POST", credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to revoke invite (${response.status})`);
        return inviteMutationResponseSchema.parse(await response.json());
      },
    }),

  resend: () =>
    mutationOptions({
      mutationKey: [...invitesAll, "resend"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites/${id}/resend`,
          { method: "POST", credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to resend invite (${response.status})`);
        return inviteMutationResponseSchema.parse(await response.json());
      },
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// create/revoke/resend all return the full Invite row (server widened in
// Layer 4), so splice the returned row into the list cache instead of
// invalidating. Append on create, replace-by-id on revoke/resend.

type InvitesListData = z.infer<typeof invitesResponseSchema>;
type InviteMutationResponse = z.infer<typeof inviteMutationResponseSchema>;
const invitesListKey = invitesQueries.list().queryKey;

function spliceInvite(queryClient: QueryClient, invite: Invite) {
  queryClient.setQueryData<InvitesListData>(invitesListKey, (prev) => {
    if (!prev) return prev;
    const exists = prev.invites.some((i) => i.id === invite.id);
    const invites = exists
      ? prev.invites.map((i) => (i.id === invite.id ? invite : i))
      : [...prev.invites, invite];
    return { ...prev, invites };
  });
}

export function createInviteMutationOptions(queryClient: QueryClient) {
  return {
    ...invitesQueries.create(),
    onSuccess: (data: InviteMutationResponse) => spliceInvite(queryClient, data.invite),
  };
}

export function revokeInviteMutationOptions(queryClient: QueryClient) {
  return {
    ...invitesQueries.revoke(),
    onSuccess: (data: InviteMutationResponse) => spliceInvite(queryClient, data.invite),
  };
}

export function resendInviteMutationOptions(queryClient: QueryClient) {
  return {
    ...invitesQueries.resend(),
    onSuccess: (data: InviteMutationResponse) => spliceInvite(queryClient, data.invite),
  };
}
