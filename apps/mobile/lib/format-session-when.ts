/**
 * Human-readable "when is this session" for notification and email copy.
 *
 * Always rendered in `STUDIO_TIMEZONE`: the server runs UTC on Fly, so a
 * 06:30 Belgrade class formatted naively reads "04:30" — and for a late
 * evening class it also lands on the wrong calendar day.
 */
import { STUDIO_TIMEZONE } from "@/lib/studio-time";

const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: STUDIO_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** sr: `"16.09. u 06:30"` · en: `"16 Sep at 06:30"`. */
export function formatSessionWhen(
  at: Date | string,
  locale: "sr" | "en",
): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  // "24" is what en-GB hour12:false emits for midnight; the studio reads it as 00.
  const hour = get("hour") === "24" ? "00" : get("hour");
  const time = `${hour}:${get("minute")}`;
  if (locale === "en") {
    return `${day} ${EN_MONTHS[Number(month) - 1]} at ${time}`;
  }
  return `${day}.${month}. u ${time}`;
}
