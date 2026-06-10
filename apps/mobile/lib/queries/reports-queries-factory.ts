import { queryOptions } from "@tanstack/react-query";
import {
  reportsBookingsDetailResponseSchema,
  reportsBookingsResponseSchema,
  reportsPackagesDetailResponseSchema,
  reportsPackagesResponseSchema,
  reportsRevenueByMethodResponseSchema,
  reportsRevenueByPackageTypeResponseSchema,
  reportsRevenueResponseSchema,
  reportsRevenueTimeSeriesResponseSchema,
  reportsSummaryResponseSchema,
  reportsUtilizationByClassTypeResponseSchema,
  reportsUtilizationByRoomResponseSchema,
  reportsUtilizationByTrainerResponseSchema,
  reportsUtilizationHeatmapResponseSchema,
  reportsUtilizationResponseSchema,
  reportsUtilizationTimeSeriesResponseSchema,
} from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

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
        return reportsRevenueResponseSchema.parse(await response.json());
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
        return reportsUtilizationResponseSchema.parse(await response.json());
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
        return reportsBookingsResponseSchema.parse(await response.json());
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
        return reportsUtilizationByRoomResponseSchema.parse(await response.json());
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
        return reportsUtilizationByClassTypeResponseSchema.parse(await response.json());
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
        return reportsUtilizationByTrainerResponseSchema.parse(await response.json());
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
        return reportsRevenueTimeSeriesResponseSchema.parse(await response.json());
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
        return reportsRevenueByPackageTypeResponseSchema.parse(await response.json());
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
        return reportsUtilizationHeatmapResponseSchema.parse(await response.json());
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
        return reportsUtilizationTimeSeriesResponseSchema.parse(await response.json());
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
        return reportsRevenueByMethodResponseSchema.parse(await response.json());
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
        return reportsBookingsDetailResponseSchema.parse(await response.json());
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
        return reportsPackagesDetailResponseSchema.parse(await response.json());
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
        return reportsPackagesResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),
};
