import { now } from "@/lib/now";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { resolveSuggestedClassType } from "@/lib/server/birthday-suggested-class-type";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { formatFullName } from "@baza/types";
import { UserRole, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/server/prisma";

function getTodayMatchSet(currentInstant: Date): Array<{ month: number; day: number }> {
  const month = currentInstant.getUTCMonth() + 1;
  const day = currentInstant.getUTCDate();
  const year = currentInstant.getUTCFullYear();
  const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const matches: Array<{ month: number; day: number }> = [{ month, day }];
  if (!isLeapYear(year) && month === 3 && day === 1) {
    matches.push({ month: 2, day: 29 });
  }
  return matches;
}

export async function POST(request: Request) {
  const cron = requireCronAuth(request);
  if (!cron.ok) return cron.response;

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const currentInstant = now();
  const todayIso = currentInstant.toISOString().slice(0, 10);
  const matchSet = getTodayMatchSet(currentInstant);

  const conditions = matchSet.map(
    ({ month, day }) =>
      Prisma.sql`(EXTRACT(MONTH FROM cp."dateOfBirth") = ${month} AND EXTRACT(DAY FROM cp."dateOfBirth") = ${day})`,
  );

  // Use the call form (prisma.$queryRaw(Prisma.sql`...`)) — the tagged-template
  // form does not splice nested Sql fragments from Prisma.join, which causes
  // them to be serialized into bind parameters and Postgres throws 22P02.
  const matchedClients = await prisma.$queryRaw<
    Array<{ clientProfileId: string; userId: string; firstName: string; lastName: string }>
  >(Prisma.sql`
    SELECT cp.id as "clientProfileId", u.id as "userId", u."firstName", u."lastName"
    FROM "ClientProfile" cp
    JOIN "User" u ON u.id = cp."userId"
    WHERE u."isActive" = true
      AND cp."dateOfBirth" IS NOT NULL
      AND (${Prisma.join(conditions, " OR ")})
  `);

  if (dryRun) {
    return ok({
      success: true,
      dryRun: true,
      today: todayIso,
      matchSet,
      matchedClients: matchedClients.length,
      sent: 0,
    });
  }

  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, isActive: true },
    select: { id: true },
  });

  let sent = 0;
  for (const client of matchedClients) {
    const suggestedClassTypeId = await resolveSuggestedClassType(client.clientProfileId);
    const payload = {
      clientProfileId: client.clientProfileId,
      clientUserId: client.userId,
      clientFullName: formatFullName(client.firstName, client.lastName),
      suggestedClassTypeId,
      today: todayIso,
    };
    for (const admin of admins) {
      await createSystemNotification(
        admin.id,
        NOTIFICATION_MESSAGE_KEYS.BIRTHDAY_ADMIN_PROMPT,
        "BIRTHDAY_ADMIN_PROMPT",
        payload,
        { dedupeKey: `birthday:${client.userId}:${todayIso}` },
      );
      sent += 1;
    }
  }

  return ok({
    success: true,
    today: todayIso,
    matchSet,
    matchedClients: matchedClients.length,
    sent,
  });
}
