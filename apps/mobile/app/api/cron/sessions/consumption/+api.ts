import { formatFullName } from "@baza/types/common";
import { cronSessionsConsumptionResponseSchema } from "@baza/types/cron";
import { now } from "@/lib/now";
import { chargeNoShowConsumption } from "@/lib/server/booking-cancellation";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { respond } from "@/lib/server/http";
import { notifyOperators } from "@/lib/server/notify-operators";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: string }).code === "P2002";
}

export async function POST(request: Request) {
  const cron = requireCronAuth(request);
  if (!cron.ok) return cron.response;

  const url = new URL(request.url);
  const mode =
    url.searchParams.get("mode") === "immediate" ? "immediate" : "scheduled";
  const lookbackHoursRaw = Number(url.searchParams.get("lookbackHours") ?? "");
  const lookbackHours =
    Number.isFinite(lookbackHoursRaw) && lookbackHoursRaw > 0
      ? lookbackHoursRaw
      : mode === "immediate"
        ? 24 * 30
        : 6;
  const dryRun = url.searchParams.get("dryRun") === "true";

  const currentInstant = now();
  const from = new Date(currentInstant.getTime() - lookbackHours * 60 * 60 * 1000);

  const candidateBookings = await prisma.booking.findMany({
    where: {
      canceledAt: null,
      session: {
        endsAt: {
          gt: from,
          lte: currentInstant,
        },
        status: {
          in: ["SCHEDULED", "COMPLETED"],
        },
      },
    },
    select: {
      sessionId: true,
      clientProfileId: true,
      clientPackageId: true,
      session: {
        select: {
          startsAt: true,
          classTypeId: true,
          classType: { select: { name: true } },
        },
      },
      clientProfile: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  let consumed = 0;
  let alreadyConsumed = 0;
  let noEligiblePackage = 0;
  let failed = 0;
  const unbackedForNotification: Array<{
    sessionId: string;
    clientFullName: string;
    classTypeName: string;
    sessionStartsAt: Date;
  }> = [];

  for (const booking of candidateBookings) {
    if (dryRun) {
      consumed += 1;
      continue;
    }

    const txResult = await tryCatch(
      prisma.$transaction((tx) =>
        chargeNoShowConsumption(tx, {
          clientProfileId: booking.clientProfileId,
          sessionId: booking.sessionId,
          clientPackageId: booking.clientPackageId,
          sessionStartsAt: booking.session.startsAt,
          sessionClassTypeId: booking.session.classTypeId,
        }),
      ),
    );

    if (txResult.error) {
      if (isUniqueConstraintError(txResult.error)) {
        alreadyConsumed += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    const outcome = txResult.data;
    if (outcome === "ALREADY_CONSUMED") {
      alreadyConsumed += 1;
      continue;
    }

    if (outcome === "NO_PACKAGE") {
      noEligiblePackage += 1;
      unbackedForNotification.push({
        sessionId: booking.sessionId,
        clientFullName: formatFullName(
          booking.clientProfile.user.firstName,
          booking.clientProfile.user.lastName,
        ),
        classTypeName: booking.session.classType.name,
        sessionStartsAt: booking.session.startsAt,
      });
      continue;
    }

    consumed += 1;
  }

  if (!dryRun && unbackedForNotification.length > 0) {
    void (async () => {
      for (const item of unbackedForNotification) {
        await notifyOperators({
          event: "UNBACKED_ATTENDANCE",
          payload: {
            sessionId: item.sessionId,
            clientFullName: item.clientFullName,
            classTypeName: item.classTypeName,
            sessionStartsAt: item.sessionStartsAt.toISOString(),
          },
          // Retry-safe across cron re-runs of the same session window.
          dedupeKey: (adminId) => `unbacked:${item.sessionId}:${adminId}`,
        });
      }
    })();
  }

  return respond(cronSessionsConsumptionResponseSchema, {
    success: true,
    mode,
    dryRun,
    lookbackHours,
    window: {
      from,
      to: currentInstant,
    },
    scannedBookings: candidateBookings.length,
    consumed,
    alreadyConsumed,
    noEligiblePackage,
    failed,
  });
}
