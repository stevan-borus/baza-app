#!/usr/bin/env tsx
/**
 * Backfill BillingRecord.clientPackageId for pre-FK rows.
 *
 * Pairs each unlinked CONFIRMED BillingRecord (clientPackageId IS NULL)
 * with the ClientPackage it most likely funded, using the same
 * (packageType, chronological-order) zip the legacy
 * `matchBillingToPackages` helper uses at read time. This is a one-time,
 * idempotent migration:
 *
 *   - Only updates rows where clientPackageId IS NULL.
 *   - Only considers ClientPackages owned by the same user.
 *   - Within each (clientUserId, packageTypeId) bucket, sort billing rows
 *     ASC by createdAt and packages ASC by startsAt, then zip 1:1.
 *   - Skips any package already claimed via the @unique FK so the 1:1
 *     invariant is preserved on re-run.
 *
 * Safe to re-run. On a freshly-seeded DB with no historical paid packages
 * this reports 0 updates.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Unpaired CONFIRMED billing rows that point at a PackageType.
  // (Rows with packageTypeId NULL never funded a package, so skip them.)
  const billing = await prisma.billingRecord.findMany({
    where: {
      clientPackageId: null,
      status: "CONFIRMED",
      packageTypeId: { not: null },
    },
    select: {
      id: true,
      clientUserId: true,
      packageTypeId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (billing.length === 0) {
    console.log("Backfilled 0 rows (no unpaired BillingRecords).");
    await prisma.$disconnect();
    return;
  }

  // Packages already claimed by some FK — exclude from the zip.
  const claimed = await prisma.billingRecord.findMany({
    where: { clientPackageId: { not: null } },
    select: { clientPackageId: true },
  });
  const claimedPackageIds = new Set(
    claimed.map((r) => r.clientPackageId).filter((id): id is string => !!id),
  );

  // For each unique clientUserId, pull all that user's packages.
  const userIds = Array.from(new Set(billing.map((b) => b.clientUserId)));
  const profiles = await prisma.clientProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const profileIdByUser = new Map<string, string>();
  for (const p of profiles) profileIdByUser.set(p.userId, p.id);

  const profileIds = profiles.map((p) => p.id);
  const allPackages = await prisma.clientPackage.findMany({
    where: { clientProfileId: { in: profileIds } },
    select: {
      id: true,
      packageTypeId: true,
      startsAt: true,
      clientProfileId: true,
    },
    orderBy: { startsAt: "asc" },
  });

  const userByProfile = new Map<string, string>();
  for (const p of profiles) userByProfile.set(p.id, p.userId);

  // Bucket packages by (userId, packageTypeId), excluding already-claimed ones.
  const packagesByBucket = new Map<string, Array<{ id: string; startsAt: Date }>>();
  for (const pkg of allPackages) {
    if (claimedPackageIds.has(pkg.id)) continue;
    const userId = userByProfile.get(pkg.clientProfileId);
    if (!userId) continue;
    const key = `${userId}::${pkg.packageTypeId}`;
    const list = packagesByBucket.get(key) ?? [];
    list.push({ id: pkg.id, startsAt: pkg.startsAt });
    packagesByBucket.set(key, list);
  }

  // Bucket billing rows by (userId, packageTypeId).
  const billingByBucket = new Map<string, Array<{ id: string; createdAt: Date }>>();
  for (const b of billing) {
    if (!b.packageTypeId) continue;
    const key = `${b.clientUserId}::${b.packageTypeId}`;
    const list = billingByBucket.get(key) ?? [];
    list.push({ id: b.id, createdAt: b.createdAt });
    billingByBucket.set(key, list);
  }

  // Zip per-bucket and accumulate FK updates.
  const pairs: Array<{ billingId: string; packageId: string }> = [];
  for (const [key, billingList] of billingByBucket) {
    const packageList = packagesByBucket.get(key) ?? [];
    const len = Math.min(billingList.length, packageList.length);
    for (let i = 0; i < len; i++) {
      pairs.push({ billingId: billingList[i].id, packageId: packageList[i].id });
    }
  }

  if (pairs.length > 0) {
    await prisma.$transaction(
      pairs.map((pair) =>
        prisma.billingRecord.update({
          where: { id: pair.billingId },
          data: { clientPackageId: pair.packageId },
        }),
      ),
    );
  }

  console.log(`Backfilled ${pairs.length} rows.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
