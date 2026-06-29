import type { Prisma } from "@/generated/prisma";

/** Works with both the root PrismaClient and an interactive-tx client. */
type Db = Prisma.TransactionClient;

/**
 * How many sessions the client already holds against this package: future
 * uncancelled bookings backed by the package, plus waitlist entries for future
 * sessions of the same class type. Waitlist entries carry no package link in
 * the schema, so they're scoped by class type — the user's chosen model where
 * a waitlist seat also reserves a session.
 */
export async function countHeldSessions(
  tx: Db,
  params: {
    clientProfileId: string;
    classTypeId: string;
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
          classTypeId: params.classTypeId,
          startsAt: { gt: params.at },
        },
      },
    }),
  ]);
  return bookings + waitlist;
}
