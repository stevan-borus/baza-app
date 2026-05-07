import { now } from "@/lib/now";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const cron = requireCronAuth(request);
  if (!cron.ok) return cron.response;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "immediate" ? "immediate" : "scheduled";
  // Scheduled: 23–25h ahead (tomorrow). Immediate: now + windowMinutes.
  const windowMinutesRaw = Number(url.searchParams.get("windowMinutes") ?? "");
  const windowMinutes = Number.isFinite(windowMinutesRaw) && windowMinutesRaw > 0
    ? windowMinutesRaw
    : mode === "immediate"
      ? 180
      : 120;
  const dryRun = url.searchParams.get("dryRun") === "true";

  const currentInstant = now();
  const from =
    mode === "immediate"
      ? new Date(currentInstant.getTime())
      : new Date(currentInstant.getTime() + 23 * 60 * 60 * 1000);
  const to =
    mode === "immediate"
      ? new Date(currentInstant.getTime() + windowMinutes * 60 * 1000)
      : new Date(currentInstant.getTime() + 25 * 60 * 60 * 1000);

  // Sessions in the reminder window with non-canceled bookings.
  const sessions = await prisma.session.findMany({
    where: {
      startsAt: {
        gte: from,
        lt: to,
      },
      status: "SCHEDULED",
    },
    select: {
      id: true,
      startsAt: true,
      bookings: {
        where: { canceledAt: null },
        select: {
          clientProfile: {
            select: { userId: true },
          },
        },
      },
    },
  });

  let sent = 0;
  for (const session of sessions) {
    for (const booking of session.bookings) {
      if (dryRun) {
        sent += 1;
        continue;
      }
      // Dedupe key prevents duplicate reminders per session/client/date.
      await createSystemNotification(
        booking.clientProfile.userId,
        NOTIFICATION_MESSAGE_KEYS.SESSION_REMINDER,
        "GENERAL",
        {
          sessionId: session.id,
          startsAt: session.startsAt.toISOString(),
        },
        `session-reminder:${session.id}:${booking.clientProfile.userId}:${session.startsAt.toISOString().slice(0, 10)}`,
      );
      sent += 1;
    }
  }

  return ok({
    success: true,
    mode,
    dryRun,
    windowMinutes,
    window: {
      from,
      to,
    },
    sent,
    sessionsChecked: sessions.length,
  });
}
