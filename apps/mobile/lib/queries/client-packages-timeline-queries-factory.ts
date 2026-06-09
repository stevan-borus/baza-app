import { queryOptions } from "@tanstack/react-query";
import {
  clientPackagesTimelineResponseSchema,
  type ClientPackageTimelineEntry,
} from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

export type { ClientPackageTimelineEntry };

async function fetchTimeline() {
  const response = await apiFetch(
    `${sharedEnv.EXPO_PUBLIC_API_URL}/api/clients/me/packages`,
    { credentials: "include" },
  );
  if (!response.ok)
    throw new Error(`Unable to load packages timeline (${response.status})`);
  return clientPackagesTimelineResponseSchema.parse(await response.json());
}

const clientPackagesTimelineAll = ["client-packages"] as const;

export const clientPackagesTimelineQueries = {
  all: clientPackagesTimelineAll,

  // Read-only surface — no mutation hook belongs here.
  list: () =>
    queryOptions({
      queryKey: [...clientPackagesTimelineAll, "timeline"] as const,
      queryFn: fetchTimeline,
      staleTime: 60_000,
    }),
};
