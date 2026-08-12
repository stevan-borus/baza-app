import type { Prisma, PrismaClient } from "@/generated/prisma";
import { computePackageExpiresAt } from "@/lib/package-expiry";
import { studioDayStartFor } from "@/lib/studio-time";

/**
 * The exact PackageType fields a Package activation snapshots. Callers fetch
 * the row themselves (both do it for 404 validation before any write); the
 * type makes omitting a snapshot field a compile error. `classTypeIds` is the
 * SKU's covered ClassType set — flattened from its join rows.
 */
export type PackageTypeSnapshot = {
  id: string;
  sessionCount: number;
  validityDays: number;
  classTypeIds: string[];
  lateCancelHours: number;
};

/**
 * Package activation (CONTEXT.md): materialize a ClientPackage from a
 * PackageType, snapshotting the SKU's terms at this moment so later
 * PackageType edits never retroactively change the package. The ONLY place
 * the snapshot copy lives — both Nova uplata (inside its BillingRecord
 * transaction) and Poklon paket / birthday gift call this. The ClassType
 * set is snapshotted as ClientPackageClassType join rows. The expiry rule
 * itself lives in `lib/package-expiry.ts`.
 *
 * `db` accepts a transaction client or the root client so callers control
 * atomicity (the booking-cancellation.ts pattern). `startsAt` is the
 * caller's business decision — which DAY the package begins: payment day for
 * Nova uplata, admin-picked (possibly future) day for a manual assign.
 *
 * The instant is normalized here rather than trusted: whatever time-of-day
 * the caller passes, the package opens at 05:00 studio time on that day and
 * runs to the close of its last day. Doing it at this chokepoint means every
 * activation path gets a whole first day — a package "starting the 20th"
 * that was submitted at 14:51 would otherwise exclude the 20th's morning
 * classes, which is the mirror of the end-of-day expiry bug.
 */
export async function createClientPackageFromType(
  db: PrismaClient | Prisma.TransactionClient,
  args: {
    clientProfileId: string;
    packageType: PackageTypeSnapshot;
    startsAt: Date;
    /**
     * Gift/comp activation: no payment, so no BillingRecord follows. The
     * package still points at the real (priced) SKU so trainer payout values
     * its sessions like any other.
     */
    isGift?: boolean;
    /**
     * How many sessions to actually grant. Defaults to the SKU's own count —
     * the paid case. A gift passes fewer (typically 1) without pretending the
     * SKU is a 1-session product.
     */
    sessionsGranted?: number;
  },
) {
  const startsAt = studioDayStartFor(args.startsAt);
  const expiresAt = computePackageExpiresAt(
    startsAt,
    args.packageType.validityDays,
  );
  const sessionsGranted = args.sessionsGranted ?? args.packageType.sessionCount;
  const { classTypes, ...row } = await db.clientPackage.create({
    data: {
      clientProfileId: args.clientProfileId,
      packageTypeId: args.packageType.id,
      lateCancelHours: args.packageType.lateCancelHours,
      startsAt,
      expiresAt,
      isGift: args.isGift ?? false,
      sessionsGranted,
      sessionsRemaining: sessionsGranted,
      classTypes: {
        create: args.packageType.classTypeIds.map((classTypeId) => ({
          classTypeId,
        })),
      },
    },
    // Canonical superset of both callers' old selects; response schemas are
    // narrower where they choose to be (under-selection-only seam).
    select: {
      id: true,
      clientProfileId: true,
      packageTypeId: true,
      lateCancelHours: true,
      startsAt: true,
      expiresAt: true,
      sessionsRemaining: true,
      sessionsGranted: true,
      isGift: true,
      classTypes: { select: { classTypeId: true } },
    },
  });
  return {
    ...row,
    classTypeIds: classTypes.map((link) => link.classTypeId),
  };
}
