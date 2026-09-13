import type { Prisma } from "@/generated/prisma";

/** Works with both the root PrismaClient and an interactive-tx client. */
type Db = Prisma.TransactionClient;

/**
 * How many sessions the client already holds against this package: future
 * uncancelled bookings backed by the package, plus waitlist entries for future
 * sessions of the package's covered class types. Waitlist entries carry no
 * package link in the schema, so they're scoped by class type — the user's
 * chosen model where a waitlist seat also reserves a session. For a mix
 * package every covered type's waitlist seats count: any of them would spend
 * from the same shared pool.
 *
 * PER-PACKAGE. Summing this across several packages double-counts the waitlist
 * (the same class-type-scoped rows come back for every package) — use
 * `countPoolBookingsByPackage` + `countPoolWaitlistHolds` when the question is
 * about a whole spendable pool.
 */
export async function countHeldSessions(
  tx: Db,
  params: {
    clientProfileId: string;
    classTypeIds: string[];
    clientPackageId: string;
    at: Date;
  },
): Promise<number> {
  const [bookings, waitlist] = await Promise.all([
    tx.booking.count({
      where: {
        clientProfileId: params.clientProfileId,
        clientPackageId: params.clientPackageId,
        canceledAt: null,
        session: { startsAt: { gt: params.at } },
      },
    }),
    tx.waitlistEntry.count({
      where: {
        clientProfileId: params.clientProfileId,
        session: {
          classTypeId: { in: params.classTypeIds },
          startsAt: { gt: params.at },
        },
      },
    }),
  ]);
  return bookings + waitlist;
}

/**
 * Future uncancelled bookings per package across a spendable POOL, in ONE
 * query. Returned keyed by package id because the pool needs both numbers: the
 * SUM is the pool's booking holds, while the per-package figure decides which
 * member a new booking may attach to (consumption decrements the booking's own
 * package and no-ops at zero — see `pickPoolPackageWithHeadroom`).
 *
 * Packages with no future bookings are present with 0, so callers can read the
 * map without re-deriving the member list.
 */
export async function countPoolBookingsByPackage(
  tx: Db,
  params: {
    clientProfileId: string;
    clientPackageIds: string[];
    at: Date;
  },
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(
    params.clientPackageIds.map((id) => [id, 0]),
  );
  if (params.clientPackageIds.length === 0) return counts;

  const grouped = await tx.booking.groupBy({
    by: ["clientPackageId"],
    where: {
      clientProfileId: params.clientProfileId,
      clientPackageId: { in: params.clientPackageIds },
      canceledAt: null,
      session: { startsAt: { gt: params.at } },
    },
    _count: { _all: true },
  });
  for (const row of grouped) {
    if (row.clientPackageId) counts[row.clientPackageId] = row._count._all;
  }
  return counts;
}

/**
 * Waitlist holds for a pool's covered ClassType set — counted ONCE for the
 * whole pool, which is the entire reason this is split out from the per-package
 * booking count. Waitlist rows carry no package FK (they're scoped by class
 * type), so counting them per member would report a client's single waitlist
 * seat as one hold per package in the pool.
 */
export async function countPoolWaitlistHolds(
  tx: Db,
  params: {
    clientProfileId: string;
    classTypeIds: string[];
    at: Date;
  },
): Promise<number> {
  return tx.waitlistEntry.count({
    where: {
      clientProfileId: params.clientProfileId,
      session: {
        classTypeId: { in: params.classTypeIds },
        startsAt: { gt: params.at },
      },
    },
  });
}
