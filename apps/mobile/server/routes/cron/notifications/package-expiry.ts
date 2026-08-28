import { cronPackageExpiryResponseSchema } from "@baza/types/cron";
import { now } from "@/lib/now";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { respond } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
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

  // Only active packages that have started and have sessions left. Revoked
  // packages can't expire in any way the client should hear about.
  // `expiresAt` is read raw: the pause routes fold the pause extension into
  // the column, so a paused client's package already carries its later date.
  const packages = await prisma.clientPackage.findMany({
    where: {
      sessionsRemaining: { gt: 0 },
      startsAt: { lte: currentInstant },
      revokedAt: null,
      expiresAt: { gte: currentInstant, lte: soon },
    },
    select: {
      id: true,
      expiresAt: true,
      sessionsRemaining: true,
      clientProfile: { select: { userId: true } },
    },
  });

  let sent = 0;
  for (const pkg of packages) {
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
        effectiveExpiresAt: pkg.expiresAt.toISOString(),
      },
      { dedupeKey: `package-expiry:${pkg.id}:${pkg.expiresAt.toISOString().slice(0, 10)}` },
    );
    sent += 1;
  }

  return respond(cronPackageExpiryResponseSchema, {
    success: true,
    mode,
    dryRun,
    windowDays,
    window: {
      from: currentInstant,
      to: soon,
    },
    sent,
    // Packages that landed IN the window — the expiry filter moved into the
    // query once expiresAt became authoritative, so nothing is scanned and
    // then discarded any more.
    scannedPackages: packages.length,
  });
}
