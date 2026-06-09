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

const revenueTimeSeriesResponseSchema = z.object({
  success: z.boolean(),
  buckets: z.array(
    z.object({
      bucketStart: z.string(),
      bucketEnd: z.string(),
      revenue: z.number(),
      paymentCount: z.number(),
    }),
  ),
});

const revenueByPackageTypeResponseSchema = z.object({
  success: z.boolean(),
  rows: z.array(
    z.object({
      packageTypeId: z.string(),
      packageTypeName: z.string(),
      revenue: z.number(),
      paymentCount: z.number(),
    }),
  ),
});

const revenueByMethodResponseSchema = z.object({
  success: z.boolean(),
  rows: z.array(
    z.object({
      method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
      revenue: z.number(),
      paymentCount: z.number(),
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

const utilizationHeatmapResponseSchema = z.object({
  success: z.boolean(),
  cells: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      timeBucket: z.enum(["morning", "midday", "afternoon", "evening"]),
      booked: z.number(),
      capacity: z.number(),
      utilization: z.number(),
    }),
  ),
});

const utilizationTimeSeriesResponseSchema = z.object({
  success: z.boolean(),
  buckets: z.array(
    z.object({
      bucketStart: z.string(),
      bucketEnd: z.string(),
      booked: z.number(),
      capacity: z.number(),
      utilization: z.number(),
    }),
  ),
});

const packagesDetailResponseSchema = z.object({
  success: z.boolean(),
  headline: z.object({
    activePackages: z.number(),
    expiringSoon: z.number(),
    consumptionRate: z.number(),
    soldInPeriod: z.number(),
  }),
  mostSold: z.array(
    z.object({
      packageTypeId: z.string(),
      packageTypeName: z.string(),
      count: z.number(),
    }),
  ),
  compVsPaid: z.object({
    paid: z.number(),
    comp: z.number(),
  }),
  recentActivations: z.array(
    z.object({
      clientPackageId: z.string(),
      clientUserId: z.string(),
      clientFullName: z.string(),
      packageTypeName: z.string(),
      startsAt: z.string(),
      isPaid: z.boolean(),
    }),
  ),
});

const bookingsDetailResponseSchema = z.object({
  success: z.boolean(),
  headline: z.object({
    totalBookings: z.number(),
    showRate: z.number(),
    canceledTotal: z.number(),
    canceledPreCutoff: z.number(),
    canceledLate: z.number(),
    waitlistCount: z.number(),
  }),
  timeSeries: z.array(
    z.object({
      bucketStart: z.string(),
      bucketEnd: z.string(),
      bookingCount: z.number(),
    }),
  ),
  topSessions: z.array(
    z.object({
      sessionId: z.string(),
      startsAt: z.string(),
      classTypeName: z.string(),
      roomName: z.string().nullable(),
      bookedCount: z.number(),
      capacity: z.number(),
    }),
  ),
});

const reportsAll = ["reports"] as const;

export const reportsQueries = {
  all: reportsAll,

  summary: (params?: { from?: string; to?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "summary",
        params?.from ?? "",
        params?.to ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/summary`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`Unable to load reports (${response.status})`);
        return reportsSummaryResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  revenue: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`Unable to load revenue report (${response.status})`);
        return revenueResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  utilization: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
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
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
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
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
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
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
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
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load utilization breakdown (${response.status})`);
        return utilizationByTrainerResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  revenueTimeSeries: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "revenue-time-series",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/revenue/time-series`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load revenue time series (${response.status})`);
        return revenueTimeSeriesResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  revenueByPackageType: (params?: { from?: string; to?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "revenue-by-package-type",
        params?.from ?? "",
        params?.to ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/revenue/by-package-type`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(
            `Unable to load revenue by package type (${response.status})`,
          );
        return revenueByPackageTypeResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  utilizationHeatmap: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "utilization-heatmap",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/utilization/heatmap`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load utilization heatmap (${response.status})`);
        return utilizationHeatmapResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  utilizationTimeSeries: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "utilization-time-series",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/utilization/time-series`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(
            `Unable to load utilization time series (${response.status})`,
          );
        return utilizationTimeSeriesResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  revenueByMethod: (params?: { from?: string; to?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "revenue-by-method",
        params?.from ?? "",
        params?.to ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/revenue/by-method`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load revenue by method (${response.status})`);
        return revenueByMethodResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  bookingsDetail: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "bookings-detail",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/bookings/detail`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load bookings detail (${response.status})`);
        return bookingsDetailResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  packagesDetail: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
        "packages-detail",
        params?.from ?? "",
        params?.to ?? "",
        params?.period ?? "",
      ] as const,
      queryFn: async () => {
        const endpoint = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/reports/packages/detail`;
        const searchParams = new URLSearchParams();
        if (params?.from) searchParams.set("from", params.from);
        if (params?.to) searchParams.set("to", params.to);
        if (params?.period) searchParams.set("period", params.period);
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load packages detail (${response.status})`);
        return packagesDetailResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  packages: (params?: { from?: string; to?: string; period?: string }) =>
    queryOptions({
      queryKey: [
        ...reportsAll,
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
        const qs = searchParams.toString();
        const url = qs ? `${endpoint}?${qs}` : endpoint;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load packages report (${response.status})`);
        return packagesReportResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),
};
