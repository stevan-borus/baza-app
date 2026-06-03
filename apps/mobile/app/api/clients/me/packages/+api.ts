import { PaymentMethod, UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

/**
 * Client-scoped packages-&-payments timeline ("Moji paketi").
 *
 * A read-only mirror of admin Naplata through a PACKAGE lens: every
 * ClientPackage the caller has held, newest first. A package backed by a
 * BillingRecord is a PAID entry (amount + method); one without (Poklon
 * paket / birthday gift) is a COMP entry so a comp never leaves a gap.
 *
 * Payment method is softened for the client: COMPANY -> "PAID" (the raw
 * company chip is back-office only), MANUAL_ONLINE -> "ONLINE". CASH/CARD
 * pass through. A CLIENT only ever sees their own packages — the query is
 * scoped to clientProfile.userId === guard.user.id, so there is no path
 * param to spoof.
 */
type SoftenedMethod = "CASH" | "CARD" | "ONLINE" | "PAID";

function softenMethod(method: PaymentMethod): SoftenedMethod {
  switch (method) {
    case PaymentMethod.CASH:
      return "CASH";
    case PaymentMethod.CARD:
      return "CARD";
    case PaymentMethod.MANUAL_ONLINE:
      return "ONLINE";
    case PaymentMethod.COMPANY:
      return "PAID";
  }
}

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;

  const profile = await prisma.clientProfile.findUnique({
    where: { userId: guard.user.id },
    select: { id: true },
  });
  if (!profile) return fail("Client profile not found", 404);

  const packages = await prisma.clientPackage.findMany({
    where: { clientProfileId: profile.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sessionsRemaining: true,
      startsAt: true,
      expiresAt: true,
      createdAt: true,
      packageType: { select: { name: true } },
      // PAID vs COMP is decided purely by the billingRecord FK relation.
      // Unlike the admin client-packages route (which also chronological-zips
      // legacy pre-FK rows), we rely on the FK alone: migration
      // 20260519151739 backfilled all legacy rows and every new package wires
      // the FK in the same transaction, so an un-backfilled package can't
      // exist here. If that ever changes, such a package would render COMP.
      billingRecord: { select: { amount: true, method: true } },
    },
  });

  const entries = packages.map((pkg) => {
    const paid = pkg.billingRecord !== null;
    return {
      id: pkg.id,
      packageTypeName: pkg.packageType.name,
      sessionsRemaining: pkg.sessionsRemaining,
      expiresAt: pkg.expiresAt.toISOString(),
      startsAt: pkg.startsAt.toISOString(),
      createdAt: pkg.createdAt.toISOString(),
      kind: paid ? ("PAID" as const) : ("COMP" as const),
      amount: paid ? pkg.billingRecord!.amount : null,
      method: paid ? softenMethod(pkg.billingRecord!.method) : null,
    };
  });

  return ok({ success: true, entries });
}
