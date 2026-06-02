import { queryOptions, mutationOptions } from "@tanstack/react-query";
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

export type Invite = z.infer<typeof inviteSchema>;

export const invitesQueries = {
  list: () =>
    queryOptions({
      queryKey: ["invites", "list"] as const,
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
      mutationKey: ["invites", "create"] as const,
      mutationFn: async (payload: { email: string; firstName: string; lastName: string; phone?: string; dateOfBirth?: string }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create invite (${response.status})`);
        return response.json();
      },
    }),

  revoke: () =>
    mutationOptions({
      mutationKey: ["invites", "revoke"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites/${id}/revoke`,
          { method: "POST", credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to revoke invite (${response.status})`);
        return response.json();
      },
    }),

  resend: () =>
    mutationOptions({
      mutationKey: ["invites", "resend"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/invites/${id}/resend`,
          { method: "POST", credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to resend invite (${response.status})`);
        return response.json();
      },
    }),
};
