import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import type { CampaignAudienceSpec } from "@baza/types/campaigns";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const base = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/campaigns`;

const campaignSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audienceSpec: z.record(z.string(), z.unknown()),
  recipientCount: z.number(),
  status: z.enum(["DRAFT", "SCHEDULED", "SENDING", "SENT"]),
  scheduledFor: z.nullable(z.string()).optional(),
  sentAt: z.nullable(z.string()).optional(),
  createdAt: z.string(),
});
export type Campaign = z.infer<typeof campaignSchema>;

const listSchema = z.object({ campaigns: z.array(campaignSchema) });
const oneSchema = z.object({ campaign: campaignSchema });
const previewSchema = z.object({ count: z.number() });

const audienceClientSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  campaignsEnabled: z.boolean(),
});
export type AudienceClient = z.infer<typeof audienceClientSchema>;
const audienceClientsSchema = z.object({ clients: z.array(audienceClientSchema) });
const recipientsSchema = z.object({
  actual: z.boolean(),
  clients: z.array(audienceClientSchema),
});

const campaignsAll = ["campaigns"] as const;

export const campaignsQueries = {
  all: campaignsAll,

  list: () =>
    queryOptions({
      queryKey: [...campaignsAll, "list"] as const,
      queryFn: async () => {
        const res = await apiFetch(base, { credentials: "include" });
        if (!res.ok) throw new Error(`Unable to load campaigns (${res.status})`);
        return listSchema.parse(await res.json());
      },
      staleTime: 30_000,
    }),

  one: (id: string) =>
    queryOptions({
      queryKey: [...campaignsAll, "one", id] as const,
      queryFn: async () => {
        const res = await apiFetch(`${base}/${id}`, { credentials: "include" });
        if (!res.ok) throw new Error(`Unable to load campaign (${res.status})`);
        return oneSchema.parse(await res.json());
      },
      staleTime: 30_000,
    }),

  /** Live audience count for a spec; keyed on the spec so it caches per-spec. enabled only when a spec is chosen. */
  preview: (spec: CampaignAudienceSpec | null) =>
    queryOptions({
      queryKey: [...campaignsAll, "preview", JSON.stringify(spec ?? {})] as const,
      enabled: spec !== null,
      queryFn: async () => {
        const res = await apiFetch(`${base}/preview`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        });
        if (!res.ok) throw new Error(`Unable to preview audience (${res.status})`);
        return previewSchema.parse(await res.json());
      },
      staleTime: 10_000,
    }),

  /** The PROJECTED audience for a spec, as people (the "view clients" sheet). */
  audienceClients: (spec: CampaignAudienceSpec | null) =>
    queryOptions({
      queryKey: [...campaignsAll, "audience-clients", JSON.stringify(spec ?? {})] as const,
      enabled: spec !== null,
      queryFn: async () => {
        const res = await apiFetch(`${base}/preview/clients`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        });
        if (!res.ok) throw new Error(`Unable to load audience (${res.status})`);
        return audienceClientsSchema.parse(await res.json());
      },
      staleTime: 10_000,
    }),

  /** A campaign's recipients: actual (SENT) or projected (not yet sent). */
  recipients: (id: string, enabled = true) =>
    queryOptions({
      queryKey: [...campaignsAll, "recipients", id] as const,
      enabled,
      queryFn: async () => {
        const res = await apiFetch(`${base}/${id}/recipients`, { credentials: "include" });
        if (!res.ok) throw new Error(`Unable to load recipients (${res.status})`);
        return recipientsSchema.parse(await res.json());
      },
      staleTime: 10_000,
    }),

  create: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "create"] as const,
      mutationFn: async (payload: {
        title: string;
        body: string;
        audienceSpec: CampaignAudienceSpec;
        scheduledFor?: string;
        sendNow?: boolean;
      }) => {
        const res = await apiFetch(base, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Unable to create campaign (${res.status})`);
        return oneSchema.parse(await res.json());
      },
    }),

  update: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "update"] as const,
      mutationFn: async (vars: {
        id: string;
        title?: string;
        body?: string;
        audienceSpec?: CampaignAudienceSpec;
        scheduledFor?: string | null;
        status?: "DRAFT" | "SCHEDULED";
      }) => {
        const { id, ...patch } = vars;
        const res = await apiFetch(`${base}/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`Unable to update campaign (${res.status})`);
        return oneSchema.parse(await res.json());
      },
    }),

  cancel: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "cancel"] as const,
      mutationFn: async (id: string) => {
        const res = await apiFetch(`${base}/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "DRAFT" }),
        });
        if (!res.ok) throw new Error(`Unable to cancel campaign (${res.status})`);
        return oneSchema.parse(await res.json());
      },
    }),

  remove: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "remove"] as const,
      mutationFn: async (id: string) => {
        const res = await apiFetch(`${base}/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error(`Unable to delete campaign (${res.status})`);
        return res.json();
      },
    }),

  send: () =>
    mutationOptions({
      mutationKey: [...campaignsAll, "send"] as const,
      mutationFn: async (id: string) => {
        const res = await apiFetch(`${base}/${id}/send`, { method: "POST", credentials: "include" });
        if (!res.ok) throw new Error(`Unable to send campaign (${res.status})`);
        return oneSchema.parse(await res.json());
      },
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

type ListData = z.infer<typeof listSchema>;
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
