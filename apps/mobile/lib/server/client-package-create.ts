import type { Prisma, PrismaClient } from "@/generated/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * the snapshot copy + expiry math live — both Nova uplata (inside its
 * BillingRecord transaction) and Poklon paket / birthday gift call this.
 * The ClassType set is snapshotted as ClientPackageClassType join rows.
 *
 * `db` accepts a transaction client or the root client so callers control
 * atomicity (the booking-cancellation.ts pattern). `startsAt` is the
 * caller's business decision: payment time for Nova uplata, admin-chosen
 * (possibly future) date for a manual assign — expiry always counts from it.
 */
export async function createClientPackageFromType(
  db: PrismaClient | Prisma.TransactionClient,
  args: {
    clientProfileId: string;
    packageType: PackageTypeSnapshot;
    startsAt: Date;
  },
) {
  const expiresAt = new Date(
    args.startsAt.getTime() + args.packageType.validityDays * DAY_MS,
  );
  const { classTypes, ...row } = await db.clientPackage.create({
    data: {
      clientProfileId: args.clientProfileId,
      packageTypeId: args.packageType.id,
      lateCancelHours: args.packageType.lateCancelHours,
      startsAt: args.startsAt,
      expiresAt,
      sessionsRemaining: args.packageType.sessionCount,
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
      classTypes: { select: { classTypeId: true } },
    },
  });
  return {
    ...row,
    classTypeIds: classTypes.map((link) => link.classTypeId),
  };
}
