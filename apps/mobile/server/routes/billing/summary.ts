import { billingSummaryResponseSchema } from "@baza/types/billing";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { buildBillingWhere } from "@/server/routes/billing";

// GET /api/billing/summary — filter-wide totals for the Naplata hero + StatStrip.
// Separate from the paginated list because these must span the WHOLE matching
// set, not the pages loaded so far (the screen used to sum loaded records, so
// every figure understated the month until the admin scrolled). Reuses the
// list's `buildBillingWhere` so the totals track the same clientUserId/from/to/q
// filter — including the status:CONFIRMED constraint added here to mirror the
// old client-side `records.filter(r => r.status === "CONFIRMED")`.
export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const clientUserId = url.searchParams.get("clientUserId") ?? undefined;
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim() || undefined;
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const filterWhere = await buildBillingWhere({ clientUserId, from, to, q });
  const where = { AND: [filterWhere, { status: "CONFIRMED" as const }] };

  // Sum + count in one aggregate; distinct paying clients via a distinct-select
  // (Prisma has no _count-distinct on a scalar). Both hit Postgres, so run
  // them concurrently. `distinctClients` is the denominator for the client-side
  // "avg per client" — kept server-side so it too is filter-wide.
  const [agg, distinctRows] = await Promise.all([
    prisma.billingRecord.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.billingRecord.findMany({
      where,
      distinct: ["clientUserId"],
      select: { clientUserId: true },
    }),
  ]);

  return respond(billingSummaryResponseSchema, {
    success: true,
    totalRevenue: agg._sum.amount ?? 0,
    count: agg._count._all,
    distinctClients: distinctRows.length,
  });
}
