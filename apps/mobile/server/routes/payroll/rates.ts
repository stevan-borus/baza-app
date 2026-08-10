import {
  createTrainerRateInputSchema,
  createTrainerRateResponseSchema,
  trainerRatesResponseSchema,
} from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, parseBody, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { studioDayStartForKey } from "@/lib/studio-time";

/**
 * Trainer commission rates.
 *
 * Rates are append-only history rather than one editable field: raising a
 * trainer's percentage in March must not silently change what February already
 * computed. A month reads the newest rate effective at or before its start.
 *
 * ADMIN only in both directions — what a trainer is paid is owner-level data,
 * and a trainer must not see (or set) anyone's rate including their own.
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const trainerUserId = new URL(request.url).searchParams.get("trainerUserId");

  const rates = await prisma.trainerRate.findMany({
    where: trainerUserId ? { trainerUserId } : undefined,
    orderBy: [{ trainerUserId: "asc" }, { effectiveFrom: "desc" }],
    select: {
      id: true,
      trainerUserId: true,
      percent: true,
      effectiveFrom: true,
      note: true,
    },
  });

  return respond(trainerRatesResponseSchema, {
    success: true,
    rates: rates.map((rate) => ({
      ...rate,
      effectiveFrom: rate.effectiveFrom.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, createTrainerRateInputSchema);
  if (!parsed.ok) return parsed.response;

  const trainer = await prisma.user.findUnique({
    where: { id: parsed.data.trainerUserId },
    select: { role: true },
  });
  if (!trainer) return fail("Trainer not found", 404);
  if (trainer.role !== UserRole.TRAINER) {
    return fail("User is not a trainer", 400);
  }

  // A rate starts on a CALENDAR DAY, so the client sends `YYYY-MM-DD` and the
  // key path stamps it directly at that day's studio opening. Round-tripping
  // through `new Date(...)` first would parse the string as UTC midnight and
  // rely on Belgrade being ahead of UTC to land back on the right date — true
  // today, but a silent trap the moment anything shifts.
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.exec(parsed.data.effectiveFrom)?.[0];
  if (!dayKey) {
    return fail("effectiveFrom must be a YYYY-MM-DD date", 400);
  }

  const rate = await prisma.trainerRate.create({
    data: {
      trainerUserId: parsed.data.trainerUserId,
      percent: parsed.data.percent,
      // The studio day boundary the rest of the app uses, so a rate "from the
      // 1st" covers that whole day's sessions.
      effectiveFrom: studioDayStartForKey(dayKey),
      note: parsed.data.note ?? null,
      createdByUserId: guard.user.id,
    },
    select: {
      id: true,
      trainerUserId: true,
      percent: true,
      effectiveFrom: true,
      note: true,
    },
  });

  return respond(
    createTrainerRateResponseSchema,
    {
      success: true,
      rate: { ...rate, effectiveFrom: rate.effectiveFrom.toISOString() },
    },
    201,
  );
}
