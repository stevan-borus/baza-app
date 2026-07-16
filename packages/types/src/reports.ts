import { z } from "zod";

export const reportsSummaryResponseSchema = z.object({
  success: z.boolean(),
  summary: z.object({
    totalClients: z.number(),
    activeClients: z.number(),
    inactiveClients: z.number(),
    totalSessions: z.number(),
    revenue: z.number(),
    totalPayments: z.number(),
  }),
});
export type ReportsSummaryResponse = z.infer<
  typeof reportsSummaryResponseSchema
>;

export const reportsPeriodSchema = z.enum(["day", "week", "month"]);
export type ReportsPeriod = z.infer<typeof reportsPeriodSchema>;

export const reportsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: reportsPeriodSchema.default("day"),
  includeDeltas: z.coerce.boolean().default(false),
});

// --- Izveštaji wire formats -------------------------------------------------
// Single home for the /api/reports/* response shapes. The API routes type
// their payloads against these (z.infer) and the React Query factory
// `.parse()`s with the same schemas, so the wire format can't silently drift
// between the two sides.

export const reportsRevenueResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      period: z.string(),
      revenue: z.number(),
      count: z.number(),
    }),
  ),
});
export type ReportsRevenueResponse = z.infer<
  typeof reportsRevenueResponseSchema
>;

export const reportsUtilizationResponseSchema = z.object({
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
export type ReportsUtilizationResponse = z.infer<
  typeof reportsUtilizationResponseSchema
>;

// Served by /api/reports/attendance — "bookings per period" for the
// Rezervacije chart.
export const reportsBookingsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      period: z.string(),
      bookings: z.number(),
    }),
  ),
});
export type ReportsBookingsResponse = z.infer<
  typeof reportsBookingsResponseSchema
>;

const reportsPackageInsightItemSchema = z.object({
  packageTypeId: z.string(),
  name: z.string(),
});
export const reportsPackagesResponseSchema = z.object({
  success: z.boolean(),
  mostUsed: z.array(
    reportsPackageInsightItemSchema.extend({ count: z.number() }),
  ),
  revenuePerType: z.array(
    reportsPackageInsightItemSchema.extend({ revenue: z.number() }),
  ),
  compVsPaid: z.object({
    paid: z.number(),
    comp: z.number(),
    total: z.number(),
  }),
});
export type ReportsPackagesResponse = z.infer<
  typeof reportsPackagesResponseSchema
>;

export const reportsUtilizationByRoomResponseSchema = z.object({
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
export type ReportsUtilizationByRoomResponse = z.infer<
  typeof reportsUtilizationByRoomResponseSchema
>;

export const reportsUtilizationByClassTypeResponseSchema = z.object({
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
export type ReportsUtilizationByClassTypeResponse = z.infer<
  typeof reportsUtilizationByClassTypeResponseSchema
>;

export const reportsUtilizationByTrainerResponseSchema = z.object({
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
export type ReportsUtilizationByTrainerResponse = z.infer<
  typeof reportsUtilizationByTrainerResponseSchema
>;

export const reportsRevenueTimeSeriesResponseSchema = z.object({
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
export type ReportsRevenueTimeSeriesResponse = z.infer<
  typeof reportsRevenueTimeSeriesResponseSchema
>;

export const reportsRevenueByPackageTypeResponseSchema = z.object({
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
export type ReportsRevenueByPackageTypeResponse = z.infer<
  typeof reportsRevenueByPackageTypeResponseSchema
>;

export const reportsRevenueByMethodResponseSchema = z.object({
  success: z.boolean(),
  rows: z.array(
    z.object({
      method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
      revenue: z.number(),
      paymentCount: z.number(),
    }),
  ),
});
export type ReportsRevenueByMethodResponse = z.infer<
  typeof reportsRevenueByMethodResponseSchema
>;

export const reportsUtilizationHeatmapResponseSchema = z.object({
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
export type ReportsUtilizationHeatmapResponse = z.infer<
  typeof reportsUtilizationHeatmapResponseSchema
>;

export const reportsUtilizationTimeSeriesResponseSchema = z.object({
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
export type ReportsUtilizationTimeSeriesResponse = z.infer<
  typeof reportsUtilizationTimeSeriesResponseSchema
>;

export const reportsPackagesDetailResponseSchema = z.object({
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
export type ReportsPackagesDetailResponse = z.infer<
  typeof reportsPackagesDetailResponseSchema
>;

export const reportsBookingsDetailResponseSchema = z.object({
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
export type ReportsBookingsDetailResponse = z.infer<
  typeof reportsBookingsDetailResponseSchema
>;
