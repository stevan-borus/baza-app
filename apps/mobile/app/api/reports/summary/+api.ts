import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  // Aggregate counts for dashboard; billing only includes confirmed payments.
  const [
    totalClients,
    activeClients,
    totalSessions,
    billingAgg,
  ] = await Promise.all([
    prisma.clientProfile.count(),
    prisma.user.count({
      where: {
        role: "CLIENT",
        isActive: true,
      },
    }),
    prisma.session.count(),
    prisma.billingRecord.aggregate({
      where: { status: "CONFIRMED" },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  return ok({
    success: true,
    summary: {
      totalClients,
      activeClients,
      inactiveClients: Math.max(totalClients - activeClients, 0),
      totalSessions,
      revenue: billingAgg._sum.amount ?? 0,
      totalPayments: billingAgg._count.id,
    },
  });
}
