import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  campaignAudienceClientsResponseSchema as audienceClientsSchema,
  campaignPreviewResponseSchema as previewSchema,
  campaignRecipientsResponseSchema as recipientsSchema,
  campaignResponseSchema as oneSchema,
  campaignsListResponseSchema as listSchema,
  type Campaign,
  type CampaignAudienceSpec,
  type CampaignsListResponse,
} from "@baza/types/campaigns";
import { apiRequest } from "@/lib/api-request";

// The wire schemas live in @baza/types/campaigns — the same objects the API
// routes validate against via respond(). Re-export the types consumers use.
export type { AudienceClient, Campaign } from "@baza/types/campaigns";

const campaignsAll = ["campaigns"] as const;

export const campaignsQueries = {
  all: campaignsAll,

  list: () =>
    queryOptions({
      queryKey: [...campaignsAll, "list"] as const,
      queryFn: () =>
        apiRequest("/api/campaigns", {
          schema: listSchema,
          errorMessage: "Unable to load campaigns",
        }),
      staleTime: 30_000,
    }),

  one: (id: string) =>
    queryOptions({
      queryKey: [...campaignsAll, "one", id] as const,
      queryFn: () =>
        apiRequest(`/api/campaigns/${id}`, {
          schema: oneSchema,
          errorMessage: "Unable to load campaign",
        }),
      staleTime: 30_000,
    }),

  /** Live audience count for a spec; keyed on the spec so it caches per-spec. enabled only when a spec is chosen. */
  preview: (spec: CampaignAudienceSpec | null) =>
    queryOptions({
      queryKey: [...campaignsAll, "preview", JSON.stringify(spec ?? {})] as const,
      enabled: spec !== null,
      queryFn: () =>
        apiRequest("/api/campaigns/preview", {
          method: "POST",
          body: spec,
          schema: previewSchema,
          errorMessage: "Unable to preview audience",
        }),
      staleTime: 10_000,
    }),

  /** The PROJECTED audience for a spec, as people (the "view clients" sheet). */
  audienceClients: (spec: CampaignAudienceSpec | null) =>
    queryOptions({
      queryKey: [...campaignsAll, "audience-clients", JSON.stringify(spec ?? {})] as const,
      enabled: spec !== null,
      queryFn: () =>
        apiRequest("/api/campaigns/preview/clients", {
          method: "POST",
          body: spec,
          schema: audienceClientsSchema,
          errorMessage: "Unable to load audience",
        }),
      staleTime: 10_000,
    }),

  /** A campaign's recipients: actual (SENT) or projected (not yet sent). */
  recipients: (id: string, enabled = true) =>
    queryOptions({
      queryKey: [...campaignsAll, "recipients", id] as const,
      enabled,
      queryFn: () =>
        apiRequest(`/api/campaigns/${id}/recipients`, {
          schema: recipientsSchema,
          errorMessage: "Unable to load recipients",
        }),
      staleTime: 10_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "create"] as const,
      mutationFn: (payload: {
        title: string;
        body: string;
        audienceSpec: CampaignAudienceSpec;
        scheduledFor?: string;
        sendNow?: boolean;
      }) =>
        apiRequest("/api/campaigns", {
          method: "POST",
          body: payload,
          schema: oneSchema,
          errorMessage: "Unable to create campaign",
        }),
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "update"] as const,
      mutationFn: (vars: {
        id: string;
        title?: string;
        body?: string;
        audienceSpec?: CampaignAudienceSpec;
        scheduledFor?: string | null;
        status?: "DRAFT" | "SCHEDULED";
      }) => {
        const { id, ...patch } = vars;
        return apiRequest(`/api/campaigns/${id}`, {
          method: "PATCH",
          body: patch,
          schema: oneSchema,
          errorMessage: "Unable to update campaign",
        });
      },
    }),

  cancel: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "cancel"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/campaigns/${id}`, {
          method: "PATCH",
          body: { status: "DRAFT" },
          schema: oneSchema,
          errorMessage: "Unable to cancel campaign",
        }),
    }),

  remove: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "remove"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/campaigns/${id}`, {
          method: "DELETE",
          errorMessage: "Unable to delete campaign",
        }),
    }),

  send: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "send"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/campaigns/${id}/send`, {
          method: "POST",
          schema: oneSchema,
          errorMessage: "Unable to send campaign",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// Per the project convention (see other *-queries-factory files), mutations are
// consumed as hooks with cache upkeep baked into onSuccess — so a component
// never has to remember to refresh the list/detail after a write. Any
// component-specific side effect (e.g. router.back()) is passed per-call via
// `mutate(vars, { onSuccess })`, which runs in addition to the baked-in one.
//
// The API returns the full campaign for create/update/cancel/send and delete
// only needs the id, so these splice the list + detail caches directly instead
// of invalidating — no refetch round-trip. (The preview/audience queries are
// spec-derived and left to refetch naturally on their own staleTime.)

type ListData = CampaignsListResponse;
const listKey = campaignsQueries.list().queryKey;
const oneKey = (id: string) => campaignsQueries.one(id).queryKey;

/** Insert (prepend) or replace a campaign in the list cache, and set its detail. */
function spliceCampaign(queryClient: QueryClient, campaign: Campaign) {
  queryClient.setQueryData<ListData>(listKey, (prev) => {
    if (!prev) return prev;
    const exists = prev.campaigns.some((c) => c.id === campaign.id);
    const campaigns = exists
      ? prev.campaigns.map((c) => (c.id === campaign.id ? campaign : c))
      : [campaign, ...prev.campaigns];
    return { campaigns };
  });
  queryClient.setQueryData(oneKey(campaign.id), { campaign });
}

export function createCampaignMutationOptions(queryClient: QueryClient) {
  return {
    ...campaignsQueries.create(),
    onSuccess: (data: { campaign: Campaign }) => spliceCampaign(queryClient, data.campaign),
  };
}

export function updateCampaignMutationOptions(queryClient: QueryClient) {
  return {
    ...campaignsQueries.update(),
    onSuccess: (data: { campaign: Campaign }) => spliceCampaign(queryClient, data.campaign),
  };
}

export function cancelCampaignMutationOptions(queryClient: QueryClient) {
  return {
    ...campaignsQueries.cancel(),
    onSuccess: (data: { campaign: Campaign }) => spliceCampaign(queryClient, data.campaign),
  };
}

export function sendCampaignMutationOptions(queryClient: QueryClient) {
  return {
    ...campaignsQueries.send(),
    onSuccess: (data: { campaign: Campaign }) => spliceCampaign(queryClient, data.campaign),
  };
}

export function removeCampaignMutationOptions(queryClient: QueryClient) {
  return {
    ...campaignsQueries.remove(),
    onSuccess: (_data: unknown, id: string) => {
      queryClient.setQueryData<ListData>(listKey, (prev) =>
        prev ? { campaigns: prev.campaigns.filter((c) => c.id !== id) } : prev,
      );
      queryClient.removeQueries({ queryKey: oneKey(id) });
    },
  };
}

export function useCreateCampaignMutation() {
  return useMutation(createCampaignMutationOptions(useQueryClient()));
}

export function useUpdateCampaignMutation() {
  return useMutation(updateCampaignMutationOptions(useQueryClient()));
}

export function useCancelCampaignMutation() {
  return useMutation(cancelCampaignMutationOptions(useQueryClient()));
}

export function useRemoveCampaignMutation() {
  return useMutation(removeCampaignMutationOptions(useQueryClient()));
}

export function useSendCampaignMutation() {
  return useMutation(sendCampaignMutationOptions(useQueryClient()));
}
