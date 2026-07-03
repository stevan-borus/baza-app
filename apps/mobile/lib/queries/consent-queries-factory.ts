import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { consentStatusResponseSchema, consentAcceptInputSchema, socialMediaConsentInputSchema, type ConsentStatusResponse, type ConsentAcceptInput, type SocialMediaConsentInput } from "@baza/types/consent";
import { apiRequest } from "@/lib/api-request";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

const consentAll = ["consent"] as const;

export const consentQueries = {
  all: consentAll,
  status: () =>
    queryOptions({
      queryKey: [...consentAll, "status"] as const,
      queryFn: () =>
        apiRequest("/api/consent/status", {
          schema: consentStatusResponseSchema,
          errorMessage: "Unable to load consent status",
        }),
      staleTime: 0, // always refetch on mount — gate state changes mid-session
    }),
};

export function useAcceptConsentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...consentAll, "accept"] as const,
    mutationFn: (input: ConsentAcceptInput) =>
      apiRequest("/api/consent/accept", {
        method: "POST",
        body: consentAcceptInputSchema.parse(input),
        errorMessage: "Accept failed",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consentQueries.all });
      queryClient.invalidateQueries({ queryKey: authQueries.me().queryKey });
    },
  });
}

export function useRefuseConsentMutation() {
  return useMutation({
    mutationKey: [...consentAll, "refuse"] as const,
    mutationFn: () =>
      apiRequest("/api/consent/refuse", {
        method: "POST",
        errorMessage: "Refuse failed",
      }),
  });
}

export function useMarkGuardianVerifiedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...consentAll, "guardian-verified"] as const,
    mutationFn: (clientUserId: string) =>
      apiRequest(`/api/admin/clients/${clientUserId}/guardian-verified`, {
        method: "POST",
        errorMessage: "Guardian-verify failed",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consentQueries.all });
      queryClient.invalidateQueries({ queryKey: clientsQueries.all });
    },
  });
}

/**
 * Optimistic options for the social-media consent toggle.
 *
 * onMutate writes the chosen value into the status cache (+ onError rollback).
 * No onSettled invalidation: the POST only confirms what we already wrote, so a
 * refetch would just reopen a window for the switch to flicker — the same
 * redundant-refetch fix applied to the notification toggle (PR #50).
 */
export function recordSocialMediaMutationOptions(queryClient: QueryClient) {
  const statusKey = consentQueries.status().queryKey;
  return {
    mutationKey: [...consentAll, "social-media"] as const,
    mutationFn: (input: SocialMediaConsentInput) =>
      apiRequest("/api/consent/social-media", {
        method: "POST",
        body: socialMediaConsentInputSchema.parse(input),
        errorMessage: "Record failed",
      }),
    onMutate: async (input: SocialMediaConsentInput) => {
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
    onError: (_err: unknown, _input: SocialMediaConsentInput, context?: { previous?: ConsentStatusResponse }) => {
      if (context?.previous) {
        queryClient.setQueryData(statusKey, context.previous);
      }
    },
  };
}

export function useRecordSocialMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation(recordSocialMediaMutationOptions(queryClient));
}
