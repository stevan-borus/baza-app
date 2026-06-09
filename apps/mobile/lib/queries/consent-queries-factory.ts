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
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/consent`;

const consentAll = ["consent"] as const;

export const consentQueries = {
  all: consentAll,
  status: () =>
    queryOptions({
      queryKey: [...consentAll, "status"] as const,
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
    mutationKey: [...consentAll, "accept"] as const,
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
      queryClient.invalidateQueries({ queryKey: consentQueries.all });
      queryClient.invalidateQueries({ queryKey: authQueries.me().queryKey });
    },
  });
}

export function useRefuseConsentMutation() {
  return useMutation({
    mutationKey: [...consentAll, "refuse"] as const,
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
    mutationKey: [...consentAll, "guardian-verified"] as const,
    mutationFn: async (clientUserId: string) => {
      const res = await apiFetch(
        `${sharedEnv.EXPO_PUBLIC_API_URL}/api/admin/clients/${clientUserId}/guardian-verified`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error(`Guardian-verify failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consentQueries.all });
      queryClient.invalidateQueries({ queryKey: clientsQueries.all });
    },
  });
}

export function useRecordSocialMediaMutation() {
  const queryClient = useQueryClient();
  const statusKey = consentQueries.status().queryKey;
  return useMutation({
    mutationKey: [...consentAll, "social-media"] as const,
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: statusKey });
      const previous = queryClient.getQueryData<ConsentStatusResponse>(statusKey);
      if (previous) {
        queryClient.setQueryData<ConsentStatusResponse>(statusKey, {
          ...previous,
          socialMediaLatestAccepted: input.accepted,
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(statusKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });
}
