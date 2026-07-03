import { queryOptions } from "@tanstack/react-query";
import { clientPackagesTimelineResponseSchema, type ClientPackageTimelineEntry } from "@baza/types/packages";
import { apiRequest } from "@/lib/api-request";

export type { ClientPackageTimelineEntry };

function fetchTimeline() {
  return apiRequest("/api/clients/me/packages", {
    schema: clientPackagesTimelineResponseSchema,
    errorMessage: "Unable to load packages timeline",
  });
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
