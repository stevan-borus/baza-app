import { queryOptions } from "@tanstack/react-query";
import { reportsBookingsDetailResponseSchema, reportsBookingsResponseSchema, reportsPackagesDetailResponseSchema, reportsPackagesResponseSchema, reportsRevenueByMethodResponseSchema, reportsRevenueByPackageTypeResponseSchema, reportsRevenueResponseSchema, reportsRevenueTimeSeriesResponseSchema, reportsSummaryResponseSchema, reportsUtilizationByClassTypeResponseSchema, reportsUtilizationByRoomResponseSchema, reportsUtilizationByTrainerResponseSchema, reportsUtilizationHeatmapResponseSchema, reportsUtilizationResponseSchema, reportsUtilizationTimeSeriesResponseSchema } from "@baza/types/reports";
import { apiRequest } from "@/lib/api-request";

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
      queryFn: () =>
        apiRequest("/api/reports/summary", {
          params: { from: params?.from, to: params?.to },
          schema: reportsSummaryResponseSchema,
          errorMessage: "Unable to load reports",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/revenue", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsRevenueResponseSchema,
          errorMessage: "Unable to load revenue report",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/utilization", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsUtilizationResponseSchema,
          errorMessage: "Unable to load utilization report",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/attendance", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsBookingsResponseSchema,
          errorMessage: "Unable to load bookings report",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/utilization/by-room", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsUtilizationByRoomResponseSchema,
          errorMessage: "Unable to load utilization breakdown",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/utilization/by-class-type", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsUtilizationByClassTypeResponseSchema,
          errorMessage: "Unable to load utilization breakdown",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/utilization/by-trainer", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsUtilizationByTrainerResponseSchema,
          errorMessage: "Unable to load utilization breakdown",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/revenue/time-series", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsRevenueTimeSeriesResponseSchema,
          errorMessage: "Unable to load revenue time series",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/revenue/by-package-type", {
          params: { from: params?.from, to: params?.to },
          schema: reportsRevenueByPackageTypeResponseSchema,
          errorMessage: "Unable to load revenue by package type",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/utilization/heatmap", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsUtilizationHeatmapResponseSchema,
          errorMessage: "Unable to load utilization heatmap",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/utilization/time-series", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsUtilizationTimeSeriesResponseSchema,
          errorMessage: "Unable to load utilization time series",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/revenue/by-method", {
          params: { from: params?.from, to: params?.to },
          schema: reportsRevenueByMethodResponseSchema,
          errorMessage: "Unable to load revenue by method",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/bookings/detail", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsBookingsDetailResponseSchema,
          errorMessage: "Unable to load bookings detail",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/packages/detail", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsPackagesDetailResponseSchema,
          errorMessage: "Unable to load packages detail",
        }),
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
      queryFn: () =>
        apiRequest("/api/reports/packages", {
          params: { from: params?.from, to: params?.to, period: params?.period },
          schema: reportsPackagesResponseSchema,
          errorMessage: "Unable to load packages report",
        }),
      staleTime: 60_000,
    }),
};
