/**
 * What changed about a session, shaped for client-facing copy.
 *
 * Structured vars rather than a pre-worded "vreme: X → Y, sala: A → B"
 * sentence: the copy templates own the wording (so sr and en can read
 * naturally), and the notification payload carries the same vars so the app
 * can re-render the row in the reader's own language.
 *
 * Every var is resolved for BOTH locales here, because one session edit fans
 * out to recipients with different `preferredLocale` values and the dispatcher
 * picks per recipient.
 */
import { formatSessionWhen } from "@/lib/format-session-when";

export type SessionChangeSnapshot = {
  startsAt: Date;
  roomName: string | null;
  trainerFullName: string | null;
  capacity: number;
};

type LocalizedVar = { sr: string; en: string };

export type SessionChangeSummary = {
  /** The start moved — the one change worth calling out against the old time. */
  rescheduled: boolean;
  vars: Record<string, LocalizedVar>;
  /**
   * Locale-independent payload additions. The app re-renders an in-app row in
   * the DEVICE language, which need not match the recipient's stored locale,
   * so the raw instants ride along for it to format itself.
   */
  isoVars: Record<string, string>;
};

/** Shown when a session has no room or no assigned trainer. */
const UNSET = "—";

function localizedWhen(at: Date): LocalizedVar {
  return { sr: formatSessionWhen(at, "sr"), en: formatSessionWhen(at, "en") };
}

function localizedName(value: string | null): LocalizedVar {
  const name = value?.trim() ? value : UNSET;
  return { sr: name, en: name };
}

/**
 * Capacity is deliberately absent from the result: the client never sees the
 * room's headcount, and "kapacitet: 6 → 8" reads as studio bookkeeping. The
 * caller still notifies on a capacity-only edit, it just describes the
 * session's current state.
 */
export function describeSessionChanges(
  before: SessionChangeSnapshot,
  after: SessionChangeSnapshot,
): SessionChangeSummary {
  const rescheduled = before.startsAt.getTime() !== after.startsAt.getTime();
  return {
    rescheduled,
    isoVars: {
      sessionStartsAtIso: after.startsAt.toISOString(),
      oldSessionStartsAtIso: before.startsAt.toISOString(),
    },
    vars: {
      sessionWhen: localizedWhen(after.startsAt),
      oldSessionWhen: localizedWhen(before.startsAt),
      roomName: localizedName(after.roomName),
      trainerFullName: localizedName(after.trainerFullName),
    },
  };
}

/** Flattens the two-locale vars down to the recipient's locale. */
export function varsForLocale(
  summary: SessionChangeSummary,
  locale: "sr" | "en",
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(summary.vars).map(([key, value]) => [key, value[locale]]),
  );
}
