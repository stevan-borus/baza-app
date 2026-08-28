/**
 * Date labels in the convention each language actually writes.
 *
 * Every screen used to hand-write its own dayjs format string, which is how
 * "24 Septembar" and "Pet., 28.8." shipped: Serbian puts a dot after the day
 * number, lowercases month names mid-sentence, and inflects them (a date in a
 * sentence is genitive — "24. septembra"), and the studio wants the full
 * weekday, not the abbreviation. The bundled dayjs `sr` locale already
 * encodes the dot (`LL` is "D. MMMM YYYY.") but only ships nominative month
 * names, capitalized, because they head those long formats. The genitive
 * months and the accusative weekdays live here now, so a new screen gets them
 * for free instead of re-deriving them wrong.
 */
import dayjs from "dayjs";
// Registered here rather than leaned on from `lib/i18n` — these helpers are
// pure formatters, so a caller (or a unit test) that never boots i18n still
// gets Serbian instead of a silent fallback to English.
import "dayjs/locale/sr";
import "dayjs/locale/en";

export type DateLang = "sr" | "en";

type DateInput = string | number | Date | dayjs.Dayjs;

/**
 * Serbian month names in the GENITIVE, indexed by `dayjs().month()` (0-11).
 *
 * dayjs' `sr` bundle only ships the nominative ("septembar"), which is the
 * form a standalone heading takes. A date inside a sentence takes the
 * genitive — "Ističe 24. septembra", not "Ističe 24. septembar" — so the one
 * caller shape this helper exists for needs the case dayjs cannot give it.
 *
 * Spelled out rather than derived by suffixing the nominative: the endings
 * only look regular ("mart" → "marta", "maj" → "maja") until "avgust" and the
 * -bar months, where a naive `+ "a"` would be right by accident and wrong the
 * moment anything else is added.
 */
const SR_MONTHS_GENITIVE = Object.freeze([
  "januara",
  "februara",
  "marta",
  "aprila",
  "maja",
  "juna",
  "jula",
  "avgusta",
  "septembra",
  "oktobra",
  "novembra",
  "decembra",
]);

/**
 * "24. septembra" (sr) / "24 September" (en) — a date inside a sentence, e.g.
 * "Ističe 24. septembra". Serbian takes the genitive case here; English has no
 * case to inflect, so it keeps the plain month name.
 */
export function formatDayMonth(date: DateInput, lang: DateLang): string {
  const d = dayjs(date).locale(lang);
  return lang === "sr"
    ? `${d.format("D")}. ${SR_MONTHS_GENITIVE[d.month()]}`
    : d.format("D MMMM");
}

/**
 * "Petak 28.8." — full weekday, a space, numeric day.month. No comma: the
 * studio asked for "PETAK 28.8.", not "PETAK, 28.8.". Rendered through
 * `CapsLabel` on the day bands, which uppercases it.
 */
export function formatFullDayDate(date: DateInput, lang: DateLang): string {
  const d = dayjs(date).locale(lang);
  return `${d.format("dddd")} ${d.format("D.M.")}`;
}

/** "Petak 28.8. 14:00" — the day band plus a 24h clock time. */
export function formatFullDayDateTime(date: DateInput, lang: DateLang): string {
  return `${formatFullDayDate(date, lang)} ${dayjs(date).format("HH:mm")}`;
}

/**
 * Serbian weekday names in the ACCUSATIVE, indexed by `dayjs().day()` (0 = Sunday).
 *
 * The preposition "u" governs the accusative here, and three of the seven
 * inflect: sreda → sredu, subota → subotu, nedelja → nedelju. The masculine
 * four (ponedeljak, utorak, četvrtak, petak) are inanimate, so their accusative
 * is identical to the nominative — which is exactly why a naive
 * `"u " + d.format("dddd")` reads correct four days out of seven and ships
 * "u sreda" on the other three.
 *
 * Spelled out rather than derived: the -a → -u rule that covers sreda and
 * subota does NOT cover nedelja (nedelju, not "nedelja"→"nedeljau"), so any
 * suffix rule needs a second exception list anyway.
 */
const SR_WEEKDAYS_ACCUSATIVE = Object.freeze([
  "nedelju",
  "ponedeljak",
  "utorak",
  "sredu",
  "četvrtak",
  "petak",
  "subotu",
]);

/**
 * Number of days back a bare weekday still identifies one specific day.
 * Seven days back, "u ponedeljak" describes today as readily as last Monday.
 */
const WEEKDAY_UNAMBIGUOUS_DAYS = 7;

/**
 * "u ponedeljak" (sr) / "on Monday" (en) — WHEN a booking was cancelled, as it
 * reads inside the row's own sentence ("Otkazano u ponedeljak").
 *
 * No date and no clock time on purpose. The row directly above this line
 * already prints "Četvrtak 27.8. · 21:00–21:50", so the earlier
 * "Otkazano četvrtak 27.8. 18:43" stated the same date twice and left the
 * reader to spot that the two times meant different things. The studio's ask
 * is the weekday alone.
 *
 * Past ~a week that weekday stops naming one day, so the helper falls back to
 * `formatDayMonth` ("8. juna") — still no clock time, since the minute a
 * month-old cancellation landed answers nothing.
 *
 * `currentInstant` is a parameter rather than a `now()` call so the caller
 * owns the clock (and the anchor-time seam) instead of this pure formatter.
 */
export function formatCancellationWhen(
  date: DateInput,
  lang: DateLang,
  currentInstant: Date,
): string {
  const d = dayjs(date).locale(lang);
  const daysAgo = dayjs(currentInstant).startOf("day").diff(d.startOf("day"), "day");
  if (daysAgo >= WEEKDAY_UNAMBIGUOUS_DAYS || daysAgo < 0) {
    return formatDayMonth(d, lang);
  }
  return lang === "sr"
    ? `u ${SR_WEEKDAYS_ACCUSATIVE[d.day()]}`
    : `on ${d.format("dddd")}`;
}
