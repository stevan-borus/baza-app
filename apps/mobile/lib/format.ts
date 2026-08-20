import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { getDateLocale } from "@/lib/i18n";
import { STUDIO_TIMEZONE, startOfStudioDay } from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Currency formatting shared across admin + client surfaces.
 *
 * RSD has no minor unit in practice — amounts are whole dinars. We render
 * `12.000 RSD` (sr-RS thousands-grouping + a literal suffix) everywhere so the
 * client "Moji paketi" timeline and admin Naplata/Izveštaji agree to the glyph.
 * Deliberately NOT Intl.NumberFormat(style:"currency"): that keys the symbol
 * placement off the UI language, so an en client would see a different glyph
 * than an sr client for the same amount.
 */
export function formatRsd(n: number): string {
  return `${Math.round(n).toLocaleString("sr-RS")} RSD`;
}

/**
 * A trainer's commission, as it reads on screen.
 *
 * Rates carry one decimal place — a trainer moving 22% to 22.5% has to be
 * representable — but almost all of them are still whole points, and printing
 * "35.0%" everywhere would be noise dressed as precision. So the decimal
 * appears only when there is one.
 *
 * The separator follows the UI language the way the rest of the app's numbers
 * do: Serbian writes 22,5 and English writes 22.5.
 */
export function formatPercent(percent: number): string {
  const decimals = Number.isInteger(percent) ? 0 : 1;
  return `${percent.toLocaleString(getDateLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/**
 * One-line label for a package's covered ClassType set ("Reformer · Energy").
 * A mix package can cover the whole catalog; past two names the line stops
 * being readable and starts truncating mid-word, so overflow collapses to a
 * count ("Reformer · Energy +3"). "+N" needs no translation, so the helper
 * stays locale-free.
 */
export function formatClassTypeList(names: string[]): string {
  const MAX_NAMES = 2;
  if (names.length <= MAX_NAMES) return names.join(" · ");
  return `${names.slice(0, MAX_NAMES).join(" · ")} +${names.length - MAX_NAMES}`;
}

/**
 * Period-range label shared by the Naplata drill header and every Izveštaji
 * sub-page. `toExclusive` is an exclusive upper bound (the API returns
 * half-open windows), so we display the last INCLUDED instant — `toExclusive`
 * minus 1ms — as the range end.
 *
 * The year is shown only when the range crosses a calendar-year boundary:
 * otherwise a single-year window like "13. maj – 13. maj" on the Godina period
 * would read as the same day with no way to tell the two endpoints apart.
 *
 * Both endpoints are read in `STUDIO_TIMEZONE` — not the viewer's zone, not
 * UTC — so the label names the same days on a phone in Belgrade, a UTC server
 * and a CI runner.
 *
 * The two ends are resolved differently, on purpose. `from` is named by its
 * own studio-zone calendar date. The END is named by the studio DAY holding
 * the last included instant: a studio month closes at 05:00 Belgrade on the
 * 1st, so that instant is 04:59 that morning, which still belongs to the
 * previous studio day because the studio has not opened yet. Taking its bare
 * calendar date is how the Mesec pill came to read "1. maj – 1. jun" instead
 * of "1. maj – 31. maj".
 *
 * Rolling `from` back the same way would be wrong: windows that start at
 * local midnight (the Naplata month, a day-sized revenue bucket) begin before
 * opening, so a symmetric rule would label them a day early — "30. apr" for a
 * May window, or a one-day bucket spanning two dates.
 *
 * `locale` is passed straight to the formatter, so callers keep whatever
 * locale string they already use (e.g. `sr-RS` vs `sr-Latn-RS`).
 */
export function formatDateRange(
  from: string | number | Date,
  toExclusive: string | number | Date,
  locale: string,
): string {
  const fromD = dayjs(new Date(from)).tz(STUDIO_TIMEZONE);
  const inclusiveTo = dayjs(
    startOfStudioDay(new Date(new Date(toExclusive).getTime() - 1)),
  ).tz(STUDIO_TIMEZONE);
  const crossesYear = fromD.year() !== inclusiveTo.year();
  const fmt: Intl.DateTimeFormatOptions = crossesYear
    ? { day: "numeric", month: "short", year: "numeric", timeZone: STUDIO_TIMEZONE }
    : { day: "numeric", month: "short", timeZone: STUDIO_TIMEZONE };
  return `${fromD.toDate().toLocaleDateString(locale, fmt)} – ${inclusiveTo.toDate().toLocaleDateString(locale, fmt)}`;
}

/**
 * Share of the client directory that's active, as a whole-number percent.
 *
 * Returns `undefined` when there's no directory to rate (zero/negative
 * denominator) so the caller renders the "—" placeholder instead of the old
 * `NaN%` — an empty studio has no attendance rate, not a broken one.
 */
export function activeClientRate(
  activeClients: number,
  totalClients: number,
): number | undefined {
  if (totalClients <= 0) return undefined;
  return Math.round((activeClients / totalClients) * 100);
}
