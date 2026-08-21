/**
 * One-off data fix: clear the ghost bookings left behind by pre-fix session
 * cancellations.
 *
 * `PATCH /api/sessions/:id` with `{status:"CANCELED"}` used to flip
 * `Session.status` alone, leaving every `Booking` row untouched and every
 * `WaitlistEntry` in place. The client kept a CONFIRMED booking on a dead
 * class that they could not clear themselves (self-cancel rejects a
 * non-SCHEDULED session), and the session could never be deleted (DELETE
 * 409s on active bookings). The route now cancels the bookings and drops the
 * waitlist in the same transaction, but only for cancellations from here on.
 *
 * This script closes the historical gap with the SAME semantics as the route:
 * stamp `Booking.canceledAt`, delete the waitlist entries, and NEVER forfeit
 * a session — no `SessionConsumption` row, no `ClientPackage.sessionsRemaining`
 * decrement. The studio called these classes off; the client keeps the credit.
 *
 * DRY RUN BY DEFAULT — prints every change and writes nothing. Re-run with
 * --apply once the diff looks right.
 *
 *   DATABASE_URL="<staging NON-POOLED>" pnpm exec tsx scripts/backfill-canceled-session-bookings.ts
 *   DATABASE_URL="<staging NON-POOLED>" pnpm exec tsx scripts/backfill-canceled-session-bookings.ts --apply
 *
 * THE TIMESTAMP: `Session.updatedAt` is used as the cancellation instant, not
 * `new Date()`. `server/routes/reports/bookings/detail.ts` buckets every
 * cancellation as "late" or "pre-cutoff" purely from where `canceledAt` falls
 * relative to the session start, so stamping "now" on a class from three
 * months ago would file it under Otkazivanja as a client cancel long after the
 * fact. `updatedAt` is the closest stored proxy for when the admin flipped the
 * status. It is still a client-shaped bucket either way — the reports have no
 * "studio canceled" category — so the dry run prints the late/pre-cutoff split
 * up front. That split is how much the Izveštaji breakdown will move.
 */
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma";
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
      '  DATABASE_URL="<url>" pnpm exec tsx scripts/backfill-canceled-session-bookings.ts',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
  log: ["warn", "error"],
});

const APPLY = process.argv.includes("--apply");
const HOUR_MS = 60 * 60 * 1000;

function studioStamp(d: Date): string {
  return dayjs(d).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD HH:mm:ss");
}

// Mirrors the late-cancel test in reports/bookings/detail.ts 1:1. Reporting a
// different rule here than the reports use would defeat the point of printing
// the split at all.
function isLateCancel(
  canceledAt: Date,
  startsAt: Date,
  lateCancelHours: number,
): boolean {
  const penaltyCutoff = new Date(startsAt.getTime() - lateCancelHours * HOUR_MS);
  return canceledAt >= penaltyCutoff && canceledAt < startsAt;
}

async function main() {
  const ghosts = await prisma.booking.findMany({
    where: {
      canceledAt: null,
      session: { status: "CANCELED" },
    },
    select: {
      id: true,
      session: {
        select: {
          id: true,
          startsAt: true,
          updatedAt: true,
          classType: { select: { name: true } },
        },
      },
      clientPackage: { select: { lateCancelHours: true } },
      clientProfile: { select: { user: { select: { email: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const waitlistEntries = await prisma.waitlistEntry.findMany({
    where: { session: { status: "CANCELED" } },
    select: { id: true, sessionId: true },
  });

  console.log(
    `${ghosts.length} ghost booking(s) found (canceledAt IS NULL on a CANCELED session).\n` +
      `${waitlistEntries.length} leftover waitlist entr(y/ies) on CANCELED sessions.\n` +
      `Mode: ${APPLY ? "APPLY — writes will happen" : "DRY RUN — no writes"}\n`,
  );

  let lateCount = 0;
  let preCutoffCount = 0;
  const affectedSessionIds = new Set<string>();
  const updates: { id: string; canceledAt: Date }[] = [];

  for (const booking of ghosts) {
    // updatedAt is `@updatedAt` and always populated; startsAt is the fallback
    // only in case a row ever arrives from outside Prisma without one.
    const stamp = booking.session.updatedAt ?? booking.session.startsAt;
    const lateCancelHours = booking.clientPackage?.lateCancelHours ?? 0;
    const late = isLateCancel(stamp, booking.session.startsAt, lateCancelHours);
    if (late) lateCount += 1;
    else preCutoffCount += 1;
    affectedSessionIds.add(booking.session.id);

    console.log(
      `- ${booking.clientProfile.user.email} — ${booking.session.classType.name}\n` +
        `    session starts  ${studioStamp(booking.session.startsAt)}\n` +
        `    canceledAt      ${studioStamp(stamp)}  (from session.updatedAt)\n` +
        `    reports bucket  ${late ? `LATE CANCEL (lateCancelHours=${lateCancelHours})` : "pre-cutoff"}\n`,
    );
    updates.push({ id: booking.id, canceledAt: stamp });
  }

  const waitlistSessionIds = new Set(waitlistEntries.map((w) => w.sessionId));
  for (const id of waitlistSessionIds) affectedSessionIds.add(id);

  console.log(
    `\nSummary: ${updates.length} ghost booking(s) to cancel, ` +
      `${waitlistEntries.length} waitlist row(s) to delete, ` +
      `across ${affectedSessionIds.size} session(s).\n` +
      `Reports impact — Otkazivanja gains ${lateCount} late cancel(s) ` +
      `and ${preCutoffCount} pre-cutoff cancel(s); the same rows leave the ` +
      `show-rate numerator.`,
  );

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  // One transaction, matching the route: a half-applied cancel is exactly the
  // state this script exists to clean up.
  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.booking.update({
        where: { id: u.id },
        data: { canceledAt: u.canceledAt },
      }),
    ),
    prisma.waitlistEntry.deleteMany({
      where: { id: { in: waitlistEntries.map((w) => w.id) } },
    }),
  ]);

  console.log(
    `\nApplied: ${updates.length} booking(s) canceled, ` +
      `${waitlistEntries.length} waitlist row(s) deleted. ` +
      `No consumption rows created, no package sessions decremented.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
