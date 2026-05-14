import { now } from "@/lib/now";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { getEffectiveExpiresAt } from "@/lib/server/package-eligibility";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const cron = requireCronAuth(request);
  if (!cron.ok) return cron.response;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "immediate" ? "immediate" : "scheduled";
  // Default window: 30d for immediate (manual test), 3d for scheduled runs.
  const windowDaysRaw = Number(url.searchParams.get("windowDays") ?? "");
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
    ? windowDaysRaw
    : mode === "immediate"
      ? 30
      : 3;
  const dryRun = url.searchParams.get("dryRun") === "true";

  const currentInstant = now();
  const soon = new Date(currentInstant.getTime() + windowDays * 24 * 60 * 60 * 1000);

  // Only active packages that have started and have sessions left.
  const packages = await prisma.clientPackage.findMany({
    where: {
      sessionsRemaining: { gt: 0 },
      startsAt: { lte: currentInstant },
    },
    select: {
      id: true,
      startsAt: true,
      expiresAt: true,
      sessionsRemaining: true,
      clientProfile: {
        select: {
          userId: true,
          packagePauses: {
            select: {
              startsAt: true,
              endsAt: true,
            },
          },
        },
      },
    },
  });

  let sent = 0;
  for (const pkg of packages) {
    const effectiveExpiresAt = getEffectiveExpiresAt(
      {
        startsAt: pkg.startsAt,
        expiresAt: pkg.expiresAt,
      },
      pkg.clientProfile.packagePauses,
      currentInstant,
    );
    // Skip if already expired or outside the notification window.
    if (effectiveExpiresAt < currentInstant || effectiveExpiresAt > soon) continue;

    if (dryRun) {
      sent += 1;
      continue;
    }
    // Dedupe key prevents duplicate notifications for same package/date.
    await createSystemNotification(
      pkg.clientProfile.userId,
      NOTIFICATION_MESSAGE_KEYS.PACKAGE_EXPIRING_SOON,
      "GENERAL",
      {
        clientPackageId: pkg.id,
        sessionsRemaining: pkg.sessionsRemaining,
        effectiveExpiresAt: effectiveExpiresAt.toISOString(),
      },
      { dedupeKey: `package-expiry:${pkg.id}:${effectiveExpiresAt.toISOString().slice(0, 10)}` },
    );
    sent += 1;
  }

  return ok({
    success: true,
    mode,
    dryRun,
    windowDays,
    window: {
      from: currentInstant,
      to: soon,
    },
    sent,
    scannedPackages: packages.length,
  });
}
