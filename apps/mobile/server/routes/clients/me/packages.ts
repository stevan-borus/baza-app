import { clientPackagesTimelineResponseSchema } from "@baza/types/packages";
import { PaymentMethod, UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { linkPackagesToBilling } from "@/lib/server/billing-package-link";
import { fail, respond } from "@/lib/server/http";
import type { SoftenedMethod } from "@/lib/payment-method-labels";
import { prisma } from "@/lib/server/prisma";

/**
 * Client-scoped packages-&-payments timeline ("Moji paketi").
 *
 * A read-only mirror of admin Naplata through a PACKAGE lens: every
 * ClientPackage the caller has held, newest first. A package backed by a
 * confirmed BillingRecord is a PAID entry (amount + method); one without
 * (Poklon paket / birthday gift) is a COMP entry so a comp never leaves a gap.
 *
 * Paid-vs-comp classification goes through the SAME `linkPackagesToBilling`
 * helper the admin per-client and Izveštaji routes use: FK first, then the
 * chronological-zip fallback for any legacy row whose FK pre-dates the
 * backfill. Reading the FK relation alone (as an earlier version did) would
 * silently render an un-backfilled-but-paid package as a comp — a customer-
 * visible disagreement with admin. Keeping both surfaces on one helper is
 * exactly what its doc comment exists to guarantee.
 *
 * Payment method is then softened for the client: COMPANY -> "PAID" (the raw
 * company chip is back-office only), MANUAL_ONLINE -> "ONLINE". CASH/CARD pass
 * through. A CLIENT only ever sees their own packages — the query is scoped to
 * clientProfile.userId === guard.user.id, so there is no path param to spoof.
 */
function softenMethod(method: PaymentMethod | string): SoftenedMethod {
  switch (method) {
    case PaymentMethod.CASH:
      return "CASH";
    case PaymentMethod.CARD:
      return "CARD";
    case PaymentMethod.MANUAL_ONLINE:
      return "ONLINE";
    case PaymentMethod.COMPANY:
      return "PAID";
    default:
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

  const [packages, billingRecords] = await Promise.all([
    prisma.clientPackage.findMany({
      where: { clientProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sessionsRemaining: true,
        startsAt: true,
        expiresAt: true,
        createdAt: true,
        packageTypeId: true,
        packageType: { select: { name: true } },
      },
    }),
    prisma.billingRecord.findMany({
      where: { clientUserId: guard.user.id, status: "CONFIRMED" },
      select: {
        id: true,
        amount: true,
        method: true,
        packageTypeId: true,
        clientPackageId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const linkMap = linkPackagesToBilling(packages, billingRecords);

  const entries = packages.map((pkg) => {
    const billing = linkMap.get(pkg.id) ?? null;
    return {
      id: pkg.id,
      packageTypeName: pkg.packageType.name,
      sessionsRemaining: pkg.sessionsRemaining,
      expiresAt: pkg.expiresAt.toISOString(),
      startsAt: pkg.startsAt.toISOString(),
      createdAt: pkg.createdAt.toISOString(),
      kind: billing ? ("PAID" as const) : ("COMP" as const),
      amount: billing ? billing.amount : null,
      method: billing ? softenMethod(billing.method) : null,
    };
  });

  return respond(clientPackagesTimelineResponseSchema, {
    success: true,
    entries,
  });
}
