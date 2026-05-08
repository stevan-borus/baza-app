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

const utilizationByRoomResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      roomId: z.string(),
      roomName: z.string(),
      totalCapacity: z.number(),
      totalBooked: z.number(),
      utilization: z.number(),
    }),
  ),
});

const utilizationByClassTypeResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      classTypeId: z.string(),
      name: z.string(),
      totalCapacity: z.number(),
      totalBooked: z.number(),
      utilization: z.number(),
    }),
  ),
});

const utilizationByTrainerResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      trainerUserId: z.string(),
      trainerName: z.string(),
      totalCapacity: z.number(),
      totalBooked: z.number(),
      utilization: z.number(),
    }),
  ),
});

export const reportsQueries = {
  summary: (params?: { from?: string; to?: string }) =>
    queryOptions({
      queryKey: [
        "reports",
        "summary",
        params?.from ?? "",
        params?.to ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/summary`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        const url =
          searchParams.size > 0
            ? `${endpoint}?${searchParams.toString()}`
            : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`Unable to load reports (${response.status})`);
        return reportsSummaryResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  revenue: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        "reports",
        "revenue",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
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
      queryKey: [
        "reports",
        "utilization",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
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
      queryKey: [
        "reports",
        "bookings",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
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

  utilizationByRoom: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        "reports",
        "utilization-by-room",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/utilization/by-room`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load utilization breakdown (${response.status})`);
        return utilizationByRoomResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  utilizationByClassType: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        "reports",
        "utilization-by-class-type",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/utilization/by-class-type`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load utilization breakdown (${response.status})`);
        return utilizationByClassTypeResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  utilizationByTrainer: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        "reports",
        "utilization-by-trainer",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/utilization/by-trainer`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load utilization breakdown (${response.status})`);
        return utilizationByTrainerResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  packages: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        "reports",
        "packages",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
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
