import { requireCronAuth } from "@/lib/server/cron-auth";
import { ok } from "@/lib/server/http";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type ConsumptionOutcome = "CONSUMED" | "NO_PACKAGE";

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

  const now = new Date();
  const from = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  const candidateBookings = await prisma.booking.findMany({
    where: {
      canceledAt: null,
      session: {
        endsAt: {
          gt: from,
          lte: now,
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
        },
      },
    },
  });

  let consumed = 0;
  let alreadyConsumed = 0;
  let noEligiblePackage = 0;
  let failed = 0;

  for (const booking of candidateBookings) {
    if (dryRun) {
      consumed += 1;
      continue;
    }

    const txResult = await tryCatch(
      prisma.$transaction(async (tx) => {
        const existingConsumption = await tx.sessionConsumption.findUnique({
          where: {
            clientProfileId_sessionId: {
              clientProfileId: booking.clientProfileId,
              sessionId: booking.sessionId,
            },
          },
          select: { id: true },
        });
        if (existingConsumption) {
          return null;
        }

        let targetPackageId = booking.clientPackageId;
        if (!targetPackageId) {
          const [clientPackages, packagePauses] = await Promise.all([
            tx.clientPackage.findMany({
              where: {
                clientProfileId: booking.clientProfileId,
                classTypeId: booking.session.classTypeId,
              },
              select: {
                id: true,
                classTypeId: true,
                startsAt: true,
                expiresAt: true,
                sessionsRemaining: true,
              },
            }),
            tx.packagePause.findMany({
              where: { clientProfileId: booking.clientProfileId },
              select: {
                startsAt: true,
                endsAt: true,
              },
            }),
          ]);

          const eligiblePackage = findEligibleClientPackage(
            clientPackages,
            packagePauses,
            booking.session.startsAt,
            booking.session.classTypeId,
          );
          targetPackageId = eligiblePackage?.id ?? null;
        }

        if (!targetPackageId) {
          return "NO_PACKAGE" as const;
        }

        const updatedPackage = await tx.clientPackage.updateMany({
          where: {
            id: targetPackageId,
            sessionsRemaining: {
              gt: 0,
            },
          },
          data: {
            sessionsRemaining: {
              decrement: 1,
            },
          },
        });
        if (updatedPackage.count === 0) {
          return "NO_PACKAGE" as const;
        }

        const createConsumptionResult = await tryCatch(
          tx.sessionConsumption.create({
            data: {
              clientProfileId: booking.clientProfileId,
              sessionId: booking.sessionId,
            },
          }),
        );
        if (createConsumptionResult.error) {
          throw createConsumptionResult.error;
        }

        return "CONSUMED" as const;
      }),
    );

    if (txResult.error) {
      if (isUniqueConstraintError(txResult.error)) {
        alreadyConsumed += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    if (!txResult.data) {
      alreadyConsumed += 1;
      continue;
    }

    const outcome = txResult.data as ConsumptionOutcome;
    if (outcome === "NO_PACKAGE") {
      noEligiblePackage += 1;
      continue;
    }

    consumed += 1;
  }

  return ok({
    success: true,
    mode,
    dryRun,
    lookbackHours,
    window: {
      from,
      to: now,
    },
    scannedBookings: candidateBookings.length,
    consumed,
    alreadyConsumed,
    noEligiblePackage,
    failed,
  });
}
