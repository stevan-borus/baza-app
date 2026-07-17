import type { CampaignAudienceSpec } from "@baza/types/campaigns";
import { Prisma } from "@/generated/prisma";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function packageStatePredicate(
  state: NonNullable<CampaignAudienceSpec["packageState"]>,
  current: Date,
): Prisma.ClientProfileWhereInput {
  const activePkg: Prisma.ClientPackageWhereInput = {
    startsAt: { lte: current },
    expiresAt: { gte: current },
    sessionsRemaining: { gt: 0 },
  };
  switch (state) {
    case "active":
      return {
        packages: { some: activePkg },
        packagePauses: {
          none: { startsAt: { lte: current }, endsAt: { gte: current } },
        },
      };
    case "paused":
      return {
        packages: { some: activePkg },
        packagePauses: {
          some: { startsAt: { lte: current }, endsAt: { gte: current } },
        },
      };
    case "expired":
      return { packages: { some: {}, none: activePkg } };
    case "none":
      return { packages: { none: {} } };
  }
}

function buildClientWhere(spec: CampaignAudienceSpec): Prisma.UserWhereInput {
  const current = now();
  const profileConditions: Prisma.ClientProfileWhereInput[] = [];

  if (spec.packageState)
    profileConditions.push(packageStatePredicate(spec.packageState, current));

  if (spec.classTypeId)
    profileConditions.push({
      // Set membership: a mix-package owner belongs to EVERY covered
      // ClassType's audience, not just an exact-scope match.
      packages: {
        some: { classTypes: { some: { classTypeId: spec.classTypeId } } },
      },
    });

  if (spec.expiringSoonDays !== undefined) {
    const soon = new Date(current.getTime() + spec.expiringSoonDays * DAY_MS);
    profileConditions.push({
      packages: {
        some: {
          startsAt: { lte: current },
          sessionsRemaining: { gt: 0 },
          expiresAt: { gte: current, lte: soon },
        },
      },
    });
  }

  if (spec.lapsedDays !== undefined) {
    // The billing-recency half of the lapsed predicate is refined in JS in
    // resolve(): the schema has no User -> BillingRecord relation
    // (BillingRecord.clientUserId is a bare String FK), so it can't be a
    // nested `where`. Here we express the structural half: no currently-active
    // package AND no recently-created ClientPackage.
    const cutoff = new Date(current.getTime() - spec.lapsedDays * DAY_MS);
    profileConditions.push({
      packages: {
        none: {
          startsAt: { lte: current },
          expiresAt: { gte: current },
          sessionsRemaining: { gt: 0 },
        },
      },
      AND: [{ packages: { none: { createdAt: { gte: cutoff } } } }],
    });
  }

  if (spec.idlePackageDays !== undefined) {
    // candidate filter: has an active package; the in-window booking check is
    // refined in JS in resolve().
    profileConditions.push({
      packages: {
        some: {
          startsAt: { lte: current },
          expiresAt: { gte: current },
          sessionsRemaining: { gt: 0 },
        },
      },
    });
  }

  return {
    role: "CLIENT",
    isActive: true,
    clientProfile:
      profileConditions.length === 0
        ? { isNot: null }
        : { is: { AND: profileConditions } },
  };
}

export async function resolveCampaignAudience(
  spec: CampaignAudienceSpec,
): Promise<string[]> {
  const where = buildClientWhere(spec);

  if (spec.idlePackageDays !== undefined) {
    const current = now();
    const windowDays = spec.idlePackageDays;
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        clientProfile: {
          select: {
            packages: {
              select: {
                startsAt: true,
                expiresAt: true,
                sessionsRemaining: true,
                bookings: {
                  select: {
                    canceledAt: true,
                    session: { select: { startsAt: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return users
      .filter((u) => {
        const pkgs = u.clientProfile?.packages ?? [];
        return pkgs.some((pkg) => {
          const active =
            pkg.startsAt <= current &&
            pkg.expiresAt >= current &&
            pkg.sessionsRemaining > 0;
          if (!active) return false;
          const windowEnd = new Date(
            pkg.startsAt.getTime() + windowDays * DAY_MS,
          );
          const bookedInWindow = pkg.bookings.some(
            (b) =>
              b.canceledAt === null &&
              b.session.startsAt >= pkg.startsAt &&
              b.session.startsAt <= windowEnd,
          );
          return !bookedInWindow;
        });
      })
      .map((u) => u.id);
  }

  if (spec.lapsedDays !== undefined) {
    // Structural half resolved in SQL; exclude anyone with a recent payment.
    const current = now();
    const cutoff = new Date(current.getTime() - spec.lapsedDays * DAY_MS);
    const users = await prisma.user.findMany({ where, select: { id: true } });
    if (users.length === 0) return [];
    // PENDING counts as engagement (a pay-later assign means the client just
    // re-committed), but VOIDED is a revoked never-paid package — that client
    // IS lapsed and should stay in the audience.
    const recentlyPaid = await prisma.billingRecord.findMany({
      where: {
        clientUserId: { in: users.map((u) => u.id) },
        createdAt: { gte: cutoff },
        status: { not: "VOIDED" },
      },
      select: { clientUserId: true },
      distinct: ["clientUserId"],
    });
    const paidSet = new Set(recentlyPaid.map((r) => r.clientUserId));
    return users.filter((u) => !paidSet.has(u.id)).map((u) => u.id);
  }

  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map((u) => u.id);
}

export async function countCampaignAudience(
  spec: CampaignAudienceSpec,
): Promise<number> {
  if (spec.idlePackageDays !== undefined || spec.lapsedDays !== undefined)
    return (await resolveCampaignAudience(spec)).length;
  return prisma.user.count({ where: buildClientWhere(spec) });
}

export type AudienceMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** false = opted out of marketing; counted in reach but won't be messaged. */
  campaignsEnabled: boolean;
};

/**
 * The audience as resolvable PEOPLE, not just a count — for the "view clients"
 * sheet. Reuses resolveCampaignAudience for the id set (so the axis logic lives
 * in one place), then hydrates names/email + the campaignsEnabled flag.
 */
export async function resolveCampaignAudienceMembers(
  spec: CampaignAudienceSpec,
): Promise<AudienceMember[]> {
  const ids = await resolveCampaignAudience(spec);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      notificationPreference: { select: { campaignsEnabled: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    // No preference row → column default is true.
    campaignsEnabled: u.notificationPreference?.campaignsEnabled ?? true,
  }));
}
