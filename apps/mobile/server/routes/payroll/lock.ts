import {
  lockPayrollPeriodInputSchema,
  lockPayrollPeriodResponseSchema,
} from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, parseBody, respond } from "@/lib/server/http";
import { computePayrollMonth } from "@/lib/server/payroll";
import { prisma } from "@/lib/server/prisma";

/**
 * POST /api/payroll/lock — freeze (or reopen) one trainer's month.
 *
 * Locking snapshots every attendee line. Without that, editing a package price
 * or revoking a package would retroactively rewrite a month that has already
 * been paid out, which is the whole reason payroll is a period rather than a
 * live report.
 *
 * Unlocking is deliberately allowed: the first months will need corrections
 * while prices settle, and a one-way lock would force data surgery. Reopening
 * discards the snapshot so the next lock recomputes from current data.
 */
export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, lockPayrollPeriodInputSchema);
  if (!parsed.ok) return parsed.response;

  const { trainerUserId, year, month } = parsed.data;
  const { from } = studioMonthRange(year, month);

  const trainer = await prisma.user.findUnique({
    where: { id: trainerUserId },
    select: { role: true },
  });
  if (!trainer) return fail("Trainer not found", 404);
  if (trainer.role !== UserRole.TRAINER) {
    return fail("User is not a trainer", 400);
  }

  if (parsed.data.unlock) {
    await prisma.payrollPeriod.upsert({
      where: {
        trainerUserId_periodStart: { trainerUserId, periodStart: from },
      },
      create: { trainerUserId, periodStart: from, status: "OPEN" },
      update: {
        status: "OPEN",
        percent: null,
        grossAmount: null,
        payoutAmount: null,
        lockedAt: null,
        lockedByUserId: null,
        // Drop the stale snapshot: an open period is computed live, and
        // keeping dead lines around would resurface on the next read.
        lines: { deleteMany: {} },
      },
      select: { id: true },
    });
    return respond(lockPayrollPeriodResponseSchema, {
      success: true,
      status: "OPEN",
      lineCount: 0,
      payout: 0,
    });
  }

  const computed = await computePayrollMonth(prisma, {
    trainerUserId,
    year,
    month,
    asOf: now(),
  });

  if (computed.percent === null) {
    return fail("Set the trainer's rate before locking the period", 409);
  }

  const lines = computed.sessions.flatMap((session) =>
    session.attendees
      // An unpriced attendance cannot be frozen into a money figure; it is
      // reported as a warning on the open period and must be resolved first.
      .filter((attendee) => attendee.sessionValue !== null)
      .map((attendee) => ({
        sessionId: session.sessionId,
        sessionStartsAt: session.startsAt,
        classTypeName: session.classTypeName,
        clientName: attendee.clientName,
        packageName: attendee.packageName,
        sessionValue: attendee.sessionValue as number,
        isGift: attendee.isGift,
      })),
  );

  await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.upsert({
      where: {
        trainerUserId_periodStart: { trainerUserId, periodStart: from },
      },
      create: {
        trainerUserId,
        periodStart: from,
        status: "LOCKED",
        percent: computed.percent,
        grossAmount: computed.gross,
        payoutAmount: computed.payout,
        lockedAt: now(),
        lockedByUserId: guard.user.id,
      },
      update: {
        status: "LOCKED",
        percent: computed.percent,
        grossAmount: computed.gross,
        payoutAmount: computed.payout,
        lockedAt: now(),
        lockedByUserId: guard.user.id,
        // Re-locking replaces the previous snapshot wholesale.
        lines: { deleteMany: {} },
      },
      select: { id: true },
    });

    if (lines.length > 0) {
      await tx.payrollLine.createMany({
        data: lines.map((line) => ({ ...line, periodId: period.id })),
      });
    }
  });

  return respond(lockPayrollPeriodResponseSchema, {
    success: true,
    status: "LOCKED",
    lineCount: lines.length,
    payout: computed.payout,
  });
}
