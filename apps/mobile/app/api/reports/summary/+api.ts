import type { ReportsSummaryResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { parseDateInput } from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  // Optional from/to window. Reports page sends them per period pill so the
  // stat strip shifts; the admin dashboard omits them and gets all-time
  // totals (its expectation since shipping). totalClients is the directory
  // size — always all-time, never per-period.
  const url = new URL(request.url);
  const from = parseDateInput(url.searchParams.get("from"));
  const to = parseDateInput(url.searchParams.get("to"));
  const range =
    from && to && from < to ? { gte: from, lt: to } : undefined;

  const [
    totalClients,
    totalSessions,
    activeClientCount,
    billingAgg,
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
  ]);

  return ok({
    success: true,
    summary: {
      totalClients,
      activeClients: activeClientCount,
      inactiveClients: Math.max(totalClients - activeClientCount, 0),
      totalSessions,
      revenue: billingAgg._sum.amount ?? 0,
      totalPayments: billingAgg._count.id,
    },
  } satisfies ReportsSummaryResponse);
}
