import { queryOptions } from "@tanstack/react-query";
import { reportsSummaryResponseSchema } from "@baza/types";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const revenueItemSchema = z.object({
  period: z.string(),
  revenue: z.number(),
  count: z.number(),
});

const revenueResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(revenueItemSchema),
});

const utilizationResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      period: z.string(),
      totalCapacity: z.number(),
      totalBooked: z.number(),
      utilization: z.number(),
    }),
  ),
});

const bookingsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      period: z.string(),
      bookings: z.number(),
    }),
  ),
});

const packageInsightItemSchema = z.object({
  packageTypeId: z.string(),
  name: z.string(),
});
const packagesReportResponseSchema = z.object({
  success: z.boolean(),
  mostUsed: z.array(packageInsightItemSchema.extend({ count: z.number() })),
  revenuePerType: z.array(packageInsightItemSchema.extend({ revenue: z.number() })),
  compVsPaid: z.object({ paid: z.number(), comp: z.number(), total: z.number() }),
});

export const reportsQueries = {
  summary: () =>
    queryOptions({
      queryKey: ["reports", "summary"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/summary`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load reports (${response.status})`);
        return reportsSummaryResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  revenue: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: ["reports", "revenue", params] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/revenue`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`Unable to load revenue report (${response.status})`);
        return revenueResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  utilization: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: ["reports", "utilization", params] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/utilization`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load utilization report (${response.status})`);
        return utilizationResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  bookings: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: ["reports", "bookings", params] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/attendance`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load bookings report (${response.status})`);
        return bookingsResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  packages: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: ["reports", "packages", params] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/packages`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load packages report (${response.status})`);
        return packagesReportResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),
};
