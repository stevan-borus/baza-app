/**
 * One-off data fix: normalize ClientPackage.expiresAt onto the new
 * end-of-studio-day rule.
 *
 * Packages created before this fix stored `startsAt + validityDays * 24h`,
 * an instant that inherited the purchase time-of-day. That had two effects:
 * the client silently lost the tail of their final day, and — because the
 * offset was a full N days from the start day rather than N-1 — a "30 day"
 * pack actually spanned 31 calendar days.
 *
 * This script recomputes each package from its own `startsAt` and its
 * PackageType's `validityDays` using the SAME helper the app now uses, so
 * the stored data and the live rule can't drift.
 *
 * DRY RUN BY DEFAULT — prints every change and writes nothing. Re-run with
 * --apply once the diff looks right.
 *
 *   DATABASE_URL="<staging NON-POOLED>" pnpm exec tsx scripts/backfill-package-expiry.ts
 *   DATABASE_URL="<staging NON-POOLED>" pnpm exec tsx scripts/backfill-package-expiry.ts --apply
 *
 * Only packages that have NOT already lapsed are touched (`expiresAt >=
 * now`). Rewriting history on long-dead packages would churn rows nobody
 * reads and could resurrect or re-kill an old pack for no benefit.
 *
 * NOTE ON DIRECTION: corrected dates land one day EARLIER than the stored
 * ones, because the old rule counted `startsAt + N * 24h` — expiring a
 * "30 day" pack at the midnight that opens day 31. Harmless on staging and
 * on seed data. Before this is ever pointed at an environment with real
 * paying clients, decide deliberately whether shortening a package someone
 * already bought is acceptable, or whether those packs should be left to
 * age out on their generous dates instead.
 */
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma";
import { computePackageExpiresAt } from "../lib/package-expiry";
import { STUDIO_TIMEZONE } from "../lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

// A standalone client rather than `lib/server/prisma`: that module pulls in
// env.server.ts, which validates the FULL server env (Resend keys, auth
// secrets, EAS tokens...). This script needs exactly one variable, and
// requiring the other nine just to read a table would make it unrunnable
// against a remote database from a plain checkout.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is required.\n" +
      '  DATABASE_URL="<url>" pnpm exec tsx scripts/backfill-package-expiry.ts',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
  log: ["warn", "error"],
});

const APPLY = process.argv.includes("--apply");

function studioStamp(d: Date): string {
  return dayjs(d).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD HH:mm:ss");
}

async function main() {
  const current = new Date();
  const packages = await prisma.clientPackage.findMany({
    where: { expiresAt: { gte: current } },
    select: {
      id: true,
      startsAt: true,
      expiresAt: true,
      packageType: { select: { name: true, validityDays: true } },
      clientProfile: {
        select: { user: { select: { email: true } } },
      },
    },
    orderBy: { expiresAt: "asc" },
  });

  console.log(
    `${packages.length} live package(s) found (expiresAt >= now).\n` +
      `Mode: ${APPLY ? "APPLY — writes will happen" : "DRY RUN — no writes"}\n`,
  );

  let gains = 0;
  let losses = 0;
  let unchanged = 0;
  const updates: { id: string; expiresAt: Date }[] = [];

  for (const pkg of packages) {
    const corrected = computePackageExpiresAt(
      pkg.startsAt,
      pkg.packageType.validityDays,
    );
    const deltaMs = corrected.getTime() - pkg.expiresAt.getTime();
    if (deltaMs === 0) {
      unchanged += 1;
      continue;
    }
    // Whole-day movement is what a client would actually notice; sub-day
    // shifts are just the end-of-day extension.
    const movesDay =
      dayjs(corrected).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD") !==
      dayjs(pkg.expiresAt).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD");
    if (deltaMs > 0) gains += 1;
    else losses += 1;

    console.log(
      `${deltaMs > 0 ? "+" : "-"} ${pkg.clientProfile?.user?.email ?? "(no user)"} — ` +
        `${pkg.packageType.name} (${pkg.packageType.validityDays}d)\n` +
        `    starts  ${studioStamp(pkg.startsAt)}\n` +
        `    before  ${studioStamp(pkg.expiresAt)}\n` +
        `    after   ${studioStamp(corrected)}` +
        `${movesDay ? "   << EXPIRY DATE MOVES" : ""}\n`,
    );
    updates.push({ id: pkg.id, expiresAt: corrected });
  }

  console.log(
    `\nSummary: ${updates.length} to change ` +
      `(${gains} gain time, ${losses} lose time), ${unchanged} already correct.`,
  );

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  // One transaction: a half-applied expiry backfill would leave two
  // different rules live in the same table.
  await prisma.$transaction(
    updates.map((u) =>
      prisma.clientPackage.update({
        where: { id: u.id },
        data: { expiresAt: u.expiresAt },
      }),
    ),
  );
  console.log(`\nApplied ${updates.length} update(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
