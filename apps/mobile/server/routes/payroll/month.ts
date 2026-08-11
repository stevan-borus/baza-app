import { payrollMonthResponseSchema } from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { parsePayrollMonthParams } from "@/lib/server/payroll-params";
import { prisma } from "@/lib/server/prisma";
import { readPayrollMonth } from "@/lib/server/payroll-month-read";

/**
 * GET /api/payroll/month?year=&month=[&trainerUserId=]
 *
 * One trainer's compensation for a calendar month. An admin may read any
 * trainer's; a TRAINER may read only their own, and the id is taken from the
 * session rather than the query string — #123 removed TRAINER from the
 * studio-wide report routes precisely because they leaked other trainers'
 * figures, and the same boundary applies here.
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const params = parsePayrollMonthParams(url.searchParams);
  if (!params) return fail("Invalid year/month", 400);

  const requestedTrainerId = url.searchParams.get("trainerUserId");
  const isAdmin = guard.user.role === UserRole.ADMIN;
  if (!isAdmin && requestedTrainerId && requestedTrainerId !== guard.user.id) {
    return fail("Forbidden", 403);
  }
  const trainerUserId = isAdmin
    ? (requestedTrainerId ?? guard.user.id)
    : guard.user.id;

  const month = await readPayrollMonth(prisma, {
    trainerUserId,
    year: params.year,
    month: params.month,
    asOf: now(),
  });

  return respond(payrollMonthResponseSchema, { success: true, month });
}
