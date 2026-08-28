/**
 * What a pause DOES to a client's packages — the extension arithmetic shared
 * by the create-pause and end-pause routes.
 *
 * The extension is written into `ClientPackage.expiresAt` at pause time rather
 * than derived on read. Derived extension was only ever half real: it grew as
 * the pause elapsed (a 7-day pause credited 0 days on day one), and every
 * surface reading the raw column — the clients-list status chip, the client
 * detail header, the expiry cron, the client's package timeline — saw no
 * extension at all and could say "expired" while booking still worked.
 *
 * Writing the grant into the column makes it unrecoverable from the dates
 * alone, so each grant is recorded on a `PackagePauseCredit` row. Ending a
 * pause early subtracts exactly what was granted minus what the pause actually
 * used, which is the only way the refund can't drift from the grant.
 */
import type { Prisma } from "@/generated/prisma";

/** Works with both the root PrismaClient and an interactive-tx client. */
type Db = Prisma.TransactionClient;

type PackagePeriod = { id: string; startsAt: Date; expiresAt: Date };

/**
 * Milliseconds the window [windowStart, windowEnd) actually froze a package.
 *
 * A pause only credits time the package would otherwise have been burning:
 * time before its own `startsAt` froze nothing (it had not begun), and time
 * past `expiresAt` is beyond the point it could be used. So the credit is the
 * overlap of the window with the package's own active period.
 */
function pauseOverlapMs(
  period: { startsAt: Date; expiresAt: Date },
  windowStart: Date,
  windowEnd: Date,
) {
  const start = Math.max(windowStart.getTime(), period.startsAt.getTime());
  const end = Math.min(windowEnd.getTime(), period.expiresAt.getTime());
  return Math.max(end - start, 0);
}

/**
 * The client's packages a pause opening at `pauseStartsAt` can extend:
 * non-revoked, and still live when the pause opens. A package that had already
 * expired before the pause began is NOT resurrected — pausing a dead package
 * would hand back time the client never had.
 */
export async function findPackagesExtendableByPause(
  db: Db,
  clientProfileId: string,
  pauseStartsAt: Date,
): Promise<PackagePeriod[]> {
  return db.clientPackage.findMany({
    where: {
      clientProfileId,
      revokedAt: null,
      expiresAt: { gte: pauseStartsAt },
    },
    select: { id: true, startsAt: true, expiresAt: true },
  });
}

/**
 * Pushes each package's `expiresAt` forward by the part of the pause window
 * that overlaps its own active period, recording the grant. Returns the new
 * expiry per package so the caller can tell the client their new date.
 */
export async function extendPackagesForPause(
  db: Db,
  packagePauseId: string,
  packages: PackagePeriod[],
  pauseStartsAt: Date,
  pauseEndsAt: Date,
) {
  const extended: { id: string; expiresAt: Date }[] = [];
  for (const pkg of packages) {
    const grantedMs = pauseOverlapMs(pkg, pauseStartsAt, pauseEndsAt);
    if (grantedMs <= 0) continue;
    const expiresAt = new Date(pkg.expiresAt.getTime() + grantedMs);
    await db.clientPackage.update({
      where: { id: pkg.id },
      data: { expiresAt },
    });
    await db.packagePauseCredit.create({
      data: {
        packagePauseId: packagePauseId,
        clientPackageId: pkg.id,
        grantedMs: BigInt(grantedMs),
      },
    });
    extended.push({ id: pkg.id, expiresAt });
  }
  return extended;
}

/**
 * Takes back the tail of a pause that never happened: each credited package
 * gives up its grant minus the part the pause actually served.
 *
 * The "actually served" part is measured against the package's period with the
 * grant removed, so the credit can't widen the window that decides how much of
 * it was earned. Credit rows are deleted along the way — the pause is either
 * truncated or gone, and a stale credit would refund twice.
 */
export async function refundUnusedPauseCredits(
  db: Db,
  packagePauseId: string,
  pauseStartsAt: Date,
  actualEndsAt: Date,
) {
  const credits = await db.packagePauseCredit.findMany({
    where: { packagePauseId },
    select: {
      id: true,
      grantedMs: true,
      clientPackage: { select: { id: true, startsAt: true, expiresAt: true } },
    },
  });

  for (const credit of credits) {
    const grantedMs = Number(credit.grantedMs);
    const pkg = credit.clientPackage;
    const unextended = {
      startsAt: pkg.startsAt,
      expiresAt: new Date(pkg.expiresAt.getTime() - grantedMs),
    };
    const servedMs = pauseOverlapMs(unextended, pauseStartsAt, actualEndsAt);
    const refundMs = grantedMs - servedMs;
    if (refundMs > 0) {
      await db.clientPackage.update({
        where: { id: pkg.id },
        data: { expiresAt: new Date(pkg.expiresAt.getTime() - refundMs) },
      });
    }
    if (servedMs > 0) {
      await db.packagePauseCredit.update({
        where: { id: credit.id },
        data: { grantedMs: BigInt(servedMs) },
      });
    } else {
      await db.packagePauseCredit.delete({ where: { id: credit.id } });
    }
  }
}
