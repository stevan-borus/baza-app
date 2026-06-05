import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import type { CampaignAudienceSpec } from "@baza/types";
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

export const campaignsQueries = {
  list: () =>
    queryOptions({
      queryKey: ["campaigns", "list"] as const,
      queryFn: async () => {
        const res = await apiFetch(base, { credentials: "include" });
        if (!res.ok) throw new Error(`Unable to load campaigns (${res.status})`);
        return listSchema.parse(await res.json());
      },
      staleTime: 30_000,
    }),

  one: (id: string) =>
    queryOptions({
      queryKey: ["campaigns", "one", id] as const,
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
      queryKey: ["campaigns", "preview", JSON.stringify(spec ?? {})] as const,
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

  create: () =>
    mutationOptions({
      mutationKey: ["campaigns", "create"] as const,
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
      mutationKey: ["campaigns", "update"] as const,
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
      mutationKey: ["campaigns", "cancel"] as const,
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
      mutationKey: ["campaigns", "remove"] as const,
      mutationFn: async (id: string) => {
        const res = await apiFetch(`${base}/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error(`Unable to delete campaign (${res.status})`);
        return res.json();
      },
    }),

  send: () =>
    mutationOptions({
      mutationKey: ["campaigns", "send"] as const,
      mutationFn: async (id: string) => {
        const res = await apiFetch(`${base}/${id}/send`, { method: "POST", credentials: "include" });
        if (!res.ok) throw new Error(`Unable to send campaign (${res.status})`);
        return oneSchema.parse(await res.json());
      },
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// Per the project convention (see other *-queries-factory files), mutations are
// consumed as hooks with the standard invalidation baked into onSuccess — so a
// component never has to remember to refresh the list/detail after a write. Any
// component-specific side effect (e.g. router.back()) is passed per-call via
// `mutate(vars, { onSuccess })`, which runs in addition to the baked-in one.

/** Invalidate everything keyed under ["campaigns"] — list, detail, and preview. */
function useInvalidateCampaigns() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });
}

export function useCreateCampaignMutation() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ ...campaignsQueries.create(), onSuccess: invalidate });
}

export function useUpdateCampaignMutation() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ ...campaignsQueries.update(), onSuccess: invalidate });
}

export function useCancelCampaignMutation() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ ...campaignsQueries.cancel(), onSuccess: invalidate });
}

export function useRemoveCampaignMutation() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ ...campaignsQueries.remove(), onSuccess: invalidate });
}

export function useSendCampaignMutation() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ ...campaignsQueries.send(), onSuccess: invalidate });
}
