import {
  clientPackagesResponseSchema,
  createClientPackageInputSchema,
  createClientPackageResponseSchema,
} from "@baza/types/packages";
import { formatFullName } from "@baza/types/common";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { createClientPackageFromType } from "@/lib/server/client-package-create";
import { linkPackagesToBilling } from "@/lib/server/billing-package-link";
import { respond, fail, parseBody } from "@/lib/server/http";
import { countHeldSessions } from "@/lib/server/booking-hold-count";
import { createSystemNotification } from "@/lib/server/notifications";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { bookableSessions } from "@/lib/server/package-hold";
import { PACKAGE_TYPE_CLASS_TYPES_SELECT } from "@/lib/server/package-type-shape";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const clientProfileId = url.searchParams.get("clientProfileId");
  // Clients see only their own packages; no clientProfileId param allowed.
  if (guard.user.role === UserRole.CLIENT) {
    const ownClientProfileId = guard.user.clientProfile?.id;
    if (!ownClientProfileId) return fail("Client profile not found", 404);

    const [packageRows, pauses] = await Promise.all([
      prisma.clientPackage.findMany({
        where: { clientProfileId: ownClientProfileId },
        orderBy: { startsAt: "desc" },
        include: {
          packageType: {
            select: {
              id: true,
              name: true,
              sessionCount: true,
              validityDays: true,
              lateCancelHours: true,
            },
          },
          ...PACKAGE_TYPE_CLASS_TYPES_SELECT,
        },
      }),
      prisma.packagePause.findMany({
        where: { clientProfileId: ownClientProfileId },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    // Which of these packages are funded by a still-PENDING BillingRecord (a
    // pay-later assignment)? The studio's flow is pay-on-arrival, so the client
    // must see they still owe. One query over the funding FK — clientPackageId
    // is @unique on BillingRecord, so a set of the ids that have a PENDING row
    // is all we need to flag `paymentPending` on the payload below.
    // Flatten the snapshot join rows: `classTypes` becomes the flat
    // [{id, name}] the response schema speaks, and drives eligibility below.
    const packages = packageRows.map((row) => ({
      ...row,
      classTypes: row.classTypes.map((link) => link.classType),
    }));

    const pendingBilling =
      packages.length > 0
        ? await prisma.billingRecord.findMany({
            where: {
              clientPackageId: { in: packages.map((p) => p.id) },
              status: "PENDING",
            },
            select: { clientPackageId: true },
          })
        : [];
    const pendingPackageIds = new Set(
      pendingBilling
        .map((b) => b.clientPackageId)
        .filter((id): id is string => id !== null),
    );

    // Per package: how many of the remaining sessions the client already
    // holds (future uncancelled bookings + waitlist seats — the same count
    // the booking gate uses) and how many they can still book. The UI shows
    // `bookable`; raw `sessionsRemaining` is consumed-at-attendance credits,
    // which clients misread as "still bookable" (the pilot rebook report).
    const currentInstant = now();
    const packagesWithHolds = await Promise.all(
      packages.map(async (pkg) => {
        // Revoked packages grant nothing (booking 409s), so they must never
        // present a positive `bookable`. Force both counts to 0 — the client
        // screens additionally hide revoked rows, but pinning the payload here
        // is the primary defense so no client-facing surface can advertise a
        // revoked package as bookable. The row itself is still returned (admin
        // history relies on the per-client branch, not this one).
        if (pkg.revokedAt) {
          return { ...pkg, heldCount: 0, bookable: 0 };
        }
        const paymentPending = pendingPackageIds.has(pkg.id);
        // NOTE: waitlist entries are counted per CLASS TYPE — they carry no
        // package FK — so with two packages of the same class each package's
        // heldCount includes the same waitlist entries. Mirrors the booking
        // gate's math (intentional), but any future UI that SUMS bookable
        // across packages would double-count those waitlist holds.
        const heldCount = await countHeldSessions(prisma, {
          clientProfileId: ownClientProfileId,
          classTypeIds: pkg.classTypes.map((classType) => classType.id),
          clientPackageId: pkg.id,
          at: currentInstant,
        });
        return {
          ...pkg,
          heldCount,
          bookable: bookableSessions({
            sessionsRemaining: pkg.sessionsRemaining,
            heldCount,
          }),
          paymentPending,
        };
      }),
    );

    // Dashboard "active package" is class-agnostic on purpose — drives the
    // home/profile pill, not the bookable calendar. Class scope is enforced at
    // booking + availability time. Here we just look for ANY eligible pack.
    // NOTE: eligibility deliberately stays on sessionsRemaining/expiresAt —
    // a fully-booked package (bookable 0, remaining > 0) is still ACTIVE.
    const activePackage = (() => {
      const eligibilityPackages = packages.map((item) => ({
        id: item.id,
        classTypeIds: item.classTypes.map((classType) => classType.id),
        startsAt: item.startsAt,
        expiresAt: item.expiresAt,
        sessionsRemaining: item.sessionsRemaining,
        revokedAt: item.revokedAt,
      }));
      const distinctClassTypeIds = Array.from(
        new Set(eligibilityPackages.flatMap((p) => p.classTypeIds)),
      );
      for (const classTypeId of distinctClassTypeIds) {
        const hit = findEligibleClientPackage(
          eligibilityPackages,
          pauses,
          currentInstant,
          classTypeId,
        );
        if (hit) return hit;
      }
      return null;
    })();

    return respond(clientPackagesResponseSchema, {
      success: true,
      packages: packagesWithHolds,
      activePackageId: activePackage?.id ?? null,
    });
  }

  // Admins may list all client packages across the studio when no clientProfileId
  // is supplied (used by /(admin)/izvestaji/paketi/aktivne-dodele assignment list).
  if (!clientProfileId) {
    if (guard.user.role !== UserRole.ADMIN) {
      return fail("clientProfileId query param is required", 400);
    }
    // Cursor-based pagination over a stable id ordering. We keep
    // `startsAt: desc` for the primary visible sort and add `id: asc` as the
    // tiebreaker so cursors stay deterministic across pages even when many
    // rows share the same startsAt instant (seed data does this).
    const search = url.searchParams.get("search")?.trim();
    const rawTake = url.searchParams.get("take");
    const parsedTake = rawTake ? parseInt(rawTake, 10) : 20;
    const take = Number.isFinite(parsedTake)
      ? Math.min(Math.max(parsedTake, 1), 100)
      : 20;
    const cursor = url.searchParams.get("cursor") ?? undefined;

    // Tokenize the query on whitespace and require EACH token to match in
    // firstName OR lastName OR email (case-insensitive), then AND the tokens
    // together — the same pattern as /api/clients. A single-string `contains`
    // across the three columns never matched "First Last" queries (e.g.
    // "Pagi Client 007") because the whole string was tested against each
    // single column; after the fullName→first/last split there is no column
    // holding the joined name. Per-token AND lets a full-name query land while
    // a single-token query (one token, e.g. an email substring) behaves as
    // before.
    const searchTokens = search ? search.split(/\s+/).filter(Boolean) : [];
    const packages = await prisma.clientPackage.findMany({
      where:
        searchTokens.length > 0
          ? {
              clientProfile: {
                user: {
                  AND: searchTokens.map((token) => ({
                    OR: [
                      { firstName: { contains: token, mode: "insensitive" } },
                      { lastName: { contains: token, mode: "insensitive" } },
                      { email: { contains: token, mode: "insensitive" } },
                    ],
                  })),
                },
              },
            }
          : undefined,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        packageType: {
          select: { name: true, sessionCount: true, validityDays: true },
        },
        ...PACKAGE_TYPE_CLASS_TYPES_SELECT,
        clientProfile: {
          select: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    const hasMore = packages.length > take;
    const pagePackages = hasMore ? packages.slice(0, take) : packages;
    const nextCursor = hasMore
      ? pagePackages[pagePackages.length - 1]?.id ?? null
      : null;
    const shaped = pagePackages.map((p) => ({
      ...p,
      classTypes: p.classTypes.map((link) => link.classType),
      client: {
        ...p.clientProfile.user,
        fullName: formatFullName(
          p.clientProfile.user.firstName,
          p.clientProfile.user.lastName,
        ),
      },
    }));
    return respond(clientPackagesResponseSchema, {
      success: true,
      packages: shaped,
      nextCursor,
    });
  }

  // Trainers may only view packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(guard.user.id, clientProfileId);
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  // Resolve the underlying User id so we can correlate to BillingRecord
  // (which keys by clientUserId, not clientProfileId).
  const clientProfile = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { userId: true },
  });
  if (!clientProfile) return fail("Client profile not found", 404);

  const [packages, billingRecords] = await Promise.all([
    prisma.clientPackage.findMany({
      where: { clientProfileId },
      orderBy: { startsAt: "desc" },
      include: {
        packageType: {
          select: { name: true, sessionCount: true, validityDays: true },
        },
        ...PACKAGE_TYPE_CLASS_TYPES_SELECT,
      },
    }),
    // All statuses on purpose: PENDING must surface as "Nije plaćeno" and
    // VOIDED as "Stornirano" on the admin package rows — filtering to
    // CONFIRMED here would render a pay-later package as a comp/gift.
    prisma.billingRecord.findMany({
      where: {
        clientUserId: clientProfile.userId,
      },
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        packageTypeId: true,
        clientPackageId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Pair each ClientPackage with the BillingRecord that funded it. The
  // primary semantics are the explicit FK on BillingRecord.clientPackageId;
  // any leftover legacy rows (FK still NULL pending backfill) are matched
  // by the chronological-zip fallback inside linkPackagesToBilling.
  const linkMap = linkPackagesToBilling(packages, billingRecords);
  const shaped = packages.map((p) => {
    const match = linkMap.get(p.id) ?? null;
    return {
      ...p,
      classTypes: p.classTypes.map((link) => link.classType),
      billingRecord: match
        ? {
            id: match.id,
            amount: match.amount,
            method: match.method,
            status: match.status,
          }
        : null,
    };
  });

  return respond(clientPackagesResponseSchema, {
    success: true,
    packages: shaped,
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, createClientPackageInputSchema);
  if (!parsed.ok) return parsed.response;

  // Trainers may only create packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      parsed.data.clientProfileId,
    );
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return fail("Invalid startsAt date", 400);

  const packageTypeRow = await prisma.packageType.findUnique({
    where: { id: parsed.data.packageTypeId },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      isBirthdayGift: true,
      classTypes: { select: { classTypeId: true } },
    },
  });
  if (!packageTypeRow) return fail("Package type not found", 404);
  const packageType = {
    ...packageTypeRow,
    classTypeIds: packageTypeRow.classTypes.map((link) => link.classTypeId),
  };

  const clientPackage = await createClientPackageFromType(prisma, {
    clientProfileId: parsed.data.clientProfileId,
    packageType,
    startsAt,
  });

  if (packageType.isBirthdayGift) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { id: parsed.data.clientProfileId },
      select: { user: { select: { id: true } } },
    });
    if (clientProfile) {
      void createSystemNotification(
        clientProfile.user.id,
        NOTIFICATION_MESSAGE_KEYS.BIRTHDAY_CLIENT_GIFT,
        "BIRTHDAY_CLIENT_GIFT",
        {
          clientPackageId: clientPackage.id,
          classTypeIds: packageType.classTypeIds,
          packageTypeName: packageType.name,
          expiresAt: clientPackage.expiresAt.toISOString(),
        },
      );
    }
  }

  return respond(
    createClientPackageResponseSchema,
    { success: true, clientPackage },
    201,
  );
}
