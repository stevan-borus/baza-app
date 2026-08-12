import {
  queryOptions,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  invitesResponseSchema,
  inviteMutationResponseSchema,
  type Invite,
  type InvitesResponse,
  type InviteMutationResponse,
} from "@baza/types/clients";
import type { createInviteInputSchema } from "@baza/types/auth";
import type { z } from "zod";
import { apiRequest } from "@/lib/api-request";

export type { Invite };

/** What the caller sends — the schema's INPUT side, so `role` stays optional
 *  (the server applies its CLIENT default). */
type CreateInvitePayload = z.input<typeof createInviteInputSchema>;

const invitesAll = ["invites"] as const;

export const invitesQueries = {
  all: invitesAll,

  list: () =>
    queryOptions({
      queryKey: [...invitesAll, "list"] as const,
      queryFn: () =>
        apiRequest("/api/invites", {
          schema: invitesResponseSchema,
          errorMessage: "Unable to load invites",
        }),
      staleTime: 30_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...invitesAll, "create"] as const,
      // Derived from the schema the route parses, so a new invite field can
      // never be accepted here and rejected there (trainerPercent was).
      mutationFn: (payload: CreateInvitePayload) =>
        apiRequest("/api/invites", {
          method: "POST",
          body: payload,
          schema: inviteMutationResponseSchema,
          errorMessage: "Unable to create invite",
        }),
    }),

  revoke: () =>
    mutationOptions({
      mutationKey: [...invitesAll, "revoke"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/invites/${id}/revoke`, {
          method: "POST",
          schema: inviteMutationResponseSchema,
          errorMessage: "Unable to revoke invite",
        }),
    }),

  resend: () =>
    mutationOptions({
      mutationKey: [...invitesAll, "resend"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/invites/${id}/resend`, {
          method: "POST",
          schema: inviteMutationResponseSchema,
          errorMessage: "Unable to resend invite",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// create/revoke/resend all return the full Invite row (server widened in
// Layer 4), so splice the returned row into the list cache instead of
// invalidating. Append on create, replace-by-id on revoke/resend.

type InvitesListData = InvitesResponse;
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
