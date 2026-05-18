import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  consentStatusResponseSchema,
  consentAcceptInputSchema,
  socialMediaConsentInputSchema,
  type ConsentStatusResponse,
  type ConsentAcceptInput,
  type SocialMediaConsentInput,
} from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/consent`;

export const consentQueries = {
  status: () =>
    queryOptions({
      queryKey: ["consent", "status"] as const,
      queryFn: async (): Promise<ConsentStatusResponse> => {
        const res = await apiFetch(`${BASE}/status`, { credentials: "include" });
        if (!res.ok) throw new Error(`Unable to load consent status (${res.status})`);
        return consentStatusResponseSchema.parse(await res.json());
      },
      staleTime: 0, // always refetch on mount — gate state changes mid-session
    }),
};

export function useAcceptConsentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["consent", "accept"] as const,
    mutationFn: async (input: ConsentAcceptInput) => {
      const parsed = consentAcceptInputSchema.parse(input);
      const res = await apiFetch(`${BASE}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(`Accept failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useRefuseConsentMutation() {
  return useMutation({
    mutationKey: ["consent", "refuse"] as const,
    mutationFn: async () => {
      const res = await apiFetch(`${BASE}/refuse`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Refuse failed (${res.status})`);
      return res.json();
    },
  });
}

export function useMarkGuardianVerifiedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["consent", "guardian-verified"] as const,
    mutationFn: async (clientUserId: string) => {
      const res = await apiFetch(
        `${sharedEnv.EXPO_PUBLIC_API_URL}/api/admin/clients/${clientUserId}/guardian-verified`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error(`Guardian-verify failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useRecordSocialMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["consent", "social-media"] as const,
    mutationFn: async (input: SocialMediaConsentInput) => {
      const parsed = socialMediaConsentInputSchema.parse(input);
      const res = await apiFetch(`${BASE}/social-media`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(`Record failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent", "status"] });
    },
  });
}
