import { reportsSummaryResponseSchema, type ReportsSummaryResponse } from "@baza/types/reports";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { respond } from "@/lib/server/http";
import { isInPauseWindow } from "@/lib/server/package-eligibility";
import { prisma } from "@/lib/server/prisma";
import { attendanceRatePercent } from "@/lib/server/report-aggregation";
import { parseDateInput } from "@/lib/server/reports";

/**
 * Clients whose package is usable at `at`: started, unexpired, sessions left,
 * not revoked, and the client not inside a live pause.
 *
 * The pause half can't live in the `where` — a pause belongs to the CLIENT,
 * not the package, and "is `at` inside one of this client's windows" is the
 * `isInPauseWindow` predicate booking already runs on. So Prisma narrows to
 * the candidate packages and that same predicate drops the paused clients.
 */
async function countClientsWithActivePackage(at: Date) {
  const candidates = await prisma.clientPackage.findMany({
    where: {
      revokedAt: null,
      startsAt: { lte: at },
      expiresAt: { gt: at },
      sessionsRemaining: { gt: 0 },
    },
    select: { clientProfileId: true },
    distinct: ["clientProfileId"],
  });
  if (candidates.length === 0) return 0;

  const profileIds = candidates.map((row) => row.clientProfileId);
  const pauses = await prisma.packagePause.findMany({
    where: {
      clientProfileId: { in: profileIds },
      startsAt: { lte: at },
      endsAt: { gt: at },
    },
    select: { clientProfileId: true, startsAt: true, endsAt: true },
  });
  const pausesByProfile = new Map<string, { startsAt: Date; endsAt: Date }[]>();
  for (const pause of pauses) {
    const list = pausesByProfile.get(pause.clientProfileId) ?? [];
    list.push(pause);
    pausesByProfile.set(pause.clientProfileId, list);
  }

  return profileIds.filter(
    (id) => !isInPauseWindow(pausesByProfile.get(id) ?? [], at),
  ).length;
}

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  // Optional from/to window. Reports page sends them per period pill so the
  // stat strip shifts; the admin dashboard sends its current studio month.
  // Omitting them gives all-time totals. totalClients is the directory size —
  // always all-time, never per-period, and so is clientsWithActivePackage,
  // which is a statement about right now rather than about the window.
  const url = new URL(request.url);
  const from = parseDateInput(url.searchParams.get("from"));
  const to = parseDateInput(url.searchParams.get("to"));
  const range =
    from && to && from < to ? { gte: from, lt: to } : undefined;

  const currentInstant = now();
  // Attendance is only meaningful once a class has happened: a session still
  // in the future has reservations, not attendance.
  const startedInRange = range
    ? { gte: range.gte, lt: new Date(Math.min(range.lt.getTime(), currentInstant.getTime())) }
    : { lt: currentInstant };
  const startedSession = {
    startsAt: startedInRange,
    status: { not: "CANCELED" as const },
  };

  const [
    totalClients,
    totalSessions,
    activeClientCount,
    billingAgg,
    clientsWithActivePackage,
    newClients,
    keptBookings,
    canceledBookings,
  ] = await Promise.all([
    prisma.clientProfile.count(),
    prisma.session.count({
      where: range ? { startsAt: range } : undefined,
    }),
    range
      ? prisma.booking
          .groupBy({
            by: ["clientProfileId"],
            where: {
              canceledAt: null,
              session: { startsAt: range },
            },
          })
          .then((rows) => rows.length)
      : prisma.user.count({ where: { role: "CLIENT", isActive: true } }),
    prisma.billingRecord.aggregate({
      where: {
        status: "CONFIRMED",
        ...(range ? { createdAt: range } : {}),
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    countClientsWithActivePackage(currentInstant),
    prisma.clientProfile.count({
      where: range ? { createdAt: range } : undefined,
    }),
    prisma.booking.count({
      where: { canceledAt: null, session: startedSession },
    }),
    prisma.booking.count({
      where: { canceledAt: { not: null }, session: startedSession },
    }),
  ]);

  return respond(reportsSummaryResponseSchema, {
    success: true,
    summary: {
      totalClients,
      activeClients: activeClientCount,
      inactiveClients: Math.max(totalClients - activeClientCount, 0),
      totalSessions,
      revenue: billingAgg._sum.amount ?? 0,
      totalPayments: billingAgg._count.id,
      clientsWithActivePackage,
      newClients,
      attendanceRate: attendanceRatePercent(keptBookings, canceledBookings),
    },
  } satisfies ReportsSummaryResponse);
}
