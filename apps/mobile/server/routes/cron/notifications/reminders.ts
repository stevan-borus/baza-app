import { cronRemindersResponseSchema } from "@baza/types/cron";
import { now } from "@/lib/now";
import { STUDIO_TIMEZONE, studioDayKey } from "@/lib/studio-time";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { respond } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";

/**
 * The session's start time as the trainer reads it off the studio clock.
 * Formatted in Belgrade explicitly: the server runs UTC, where a 07:30 class
 * would otherwise render as 05:30.
 */
function formatStudioTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

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
      trainerUserId: true,
      bookings: {
        where: { canceledAt: null },
        select: {
          clientProfile: {
            select: { userId: true },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
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
        {
          dedupeKey: `session-reminder:${session.id}:${booking.clientProfile.userId}:${session.startsAt.toISOString().slice(0, 10)}`,
        },
      );
      sent += 1;
    }
  }

  // Trainers get ONE digest per studio day rather than a reminder per session.
  // A trainer running six classes would otherwise get six separate pushes for
  // a single workday, which is spam — the useful facts are "how many" and
  // "when do I need to be in", both of which fit in one message.
  //
  // Sessions are ordered by startsAt above, so the first entry per trainer is
  // their earliest class.
  const sessionsByTrainer = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const existing = sessionsByTrainer.get(session.trainerUserId);
    if (existing) existing.push(session);
    else sessionsByTrainer.set(session.trainerUserId, [session]);
  }

  let trainerDigestsSent = 0;
  for (const [trainerUserId, trainerSessions] of sessionsByTrainer) {
    if (dryRun) {
      trainerDigestsSent += 1;
      continue;
    }
    const first = trainerSessions[0];
    await createSystemNotification(
      trainerUserId,
      NOTIFICATION_MESSAGE_KEYS.TRAINER_DAILY_SCHEDULE,
      "GENERAL",
      {
        count: trainerSessions.length,
        firstStartsAt: formatStudioTime(first.startsAt),
        firstSessionId: first.id,
        startsAt: first.startsAt.toISOString(),
      },
      {
        // Keyed on the STUDIO day of the first session, so re-running the cron
        // within the same day resolves to the one existing log row.
        dedupeKey: `trainer-daily-schedule:${trainerUserId}:${studioDayKey(first.startsAt)}`,
      },
    );
    trainerDigestsSent += 1;
  }

  return respond(cronRemindersResponseSchema, {
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
    trainerDigestsSent,
  });
}
