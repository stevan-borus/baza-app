/**
 * Pure layout math for the day-view time axis. Kept free of any React Native
 * imports so it can be unit-tested in a plain Node environment (importing the
 * .tsx component pulls in react-native and fails to parse under vitest).
 */
import dayjs from "dayjs";

export const HOUR_START = 6;
export const HOUR_END = 22;
export const PX_PER_MINUTE = 1;
export const HOUR_HEIGHT = 60 * PX_PER_MINUTE;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Opaque soft-tint fill: the class color blended over the page background at a
 * low ratio. Returns an `rgb(...)` (never `rgba`) so the hour grid lines drawn
 * underneath a block can never show through — a translucent wash let a line cut
 * across any block spanning an hour boundary (e.g. 06:30–07:30), which looked
 * broken. `ratio` is how much of the class color bleeds into the canvas color.
 */
export function tintBg(hex: string, background: string, ratio = 0.2): string {
  const [r, g, b] = parseHex(hex);
  const [br, bg, bb] = parseHex(background);
  const mix = (c: number, bc: number) => Math.round(bc + (c - bc) * ratio);
  return `rgb(${mix(r, br)}, ${mix(g, bg)}, ${mix(b, bb)})`;
}

/**
 * On-block text color: the theme foreground nudged toward the class color so
 * the secondary line reads as a darker shade of the event (a dark green in
 * light mode, a light green in dark mode) with strong contrast against the
 * tinted fill — generic `muted` grey, tuned for the page background, washes
 * out on a colored block. Starting from `foreground` (not the class color)
 * guarantees the right light/dark direction; `ratio` is how much hue to add.
 */
export function tintText(hex: string, foreground: string, ratio = 0.35): string {
  const [r, g, b] = parseHex(hex);
  const [fr, fg, fb] = parseHex(foreground);
  const mix = (c: number, fc: number) => Math.round(fc + (c - fc) * ratio);
  return `rgb(${mix(r, fr)}, ${mix(g, fg)}, ${mix(b, fb)})`;
}

/**
 * Computes the top offset (px) and height (px) for a session block on the
 * time axis. Sessions outside [HOUR_START, HOUR_END] are clipped.
 *
 *   sessionBlockPosition({ startsAt: 06:00, endsAt: 07:00 }) → { top: 0, height: 60 }
 *   sessionBlockPosition({ startsAt: 10:30, endsAt: 11:30 }) → { top: 270, height: 60 }
 */
export function sessionBlockPosition(s: {
  startsAt: string;
  endsAt: string;
}): { top: number; height: number } {
  const start = dayjs(s.startsAt);
  const end = dayjs(s.endsAt);
  const rawStart = start.hour() * 60 + start.minute() - HOUR_START * 60;
  const rawEnd = end.hour() * 60 + end.minute() - HOUR_START * 60;
  const clipMin = 0;
  const clipMax = (HOUR_END - HOUR_START) * 60;
  const clampedStart = Math.max(clipMin, rawStart);
  const clampedEnd = Math.min(clipMax, rawEnd);
  return {
    top: clampedStart * PX_PER_MINUTE,
    height: Math.max(24, (clampedEnd - clampedStart) * PX_PER_MINUTE),
  };
}

/**
 * Assigns each session a column index (`col`) and the number of columns in its
 * overlap group (`cols`) so concurrent sessions render side-by-side instead of
 * stacking on top of each other (the studio runs multiple rooms at once).
 *
 * Sessions that merely touch at a boundary (a ends exactly when b starts) do
 * NOT overlap. Groups are built by transitive overlap: any chain of mutually
 * overlapping sessions shares one column count.
 *
 *   [10-11, 10-11]        → both { cols: 2 }, cols 0 and 1
 *   [6:30-7:30, 7:30-8:30]→ both { cols: 1 } (touch, not overlap)
 */
export function layoutSessions(
  sessions: Array<{ id: string; startsAt: string; endsAt: string }>,
): Array<{ id: string; col: number; cols: number }> {
  const items = sessions
    .map((s) => ({
      id: s.id,
      start: dayjs(s.startsAt).valueOf(),
      end: dayjs(s.endsAt).valueOf(),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result = new Map<string, { col: number; cols: number }>();
  let i = 0;
  while (i < items.length) {
    // Grow a group while the next item starts before the group's current max end.
    const group = [items[i]];
    let groupEnd = items[i].end;
    let j = i + 1;
    while (j < items.length && items[j].start < groupEnd) {
      group.push(items[j]);
      groupEnd = Math.max(groupEnd, items[j].end);
      j++;
    }
    // Greedy column packing: place each in the first column whose last block
    // has already ended (no overlap), else open a new column.
    const colEnds: number[] = [];
    for (const it of group) {
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= it.start) {
          placed = c;
          break;
        }
      }
      if (placed === -1) {
        placed = colEnds.length;
        colEnds.push(it.end);
      } else {
        colEnds[placed] = it.end;
      }
      result.set(it.id, { col: placed, cols: 0 });
    }
    const cols = colEnds.length;
    for (const it of group) result.get(it.id)!.cols = cols;
    i = j;
  }

  // Preserve input order in the returned array.
  return sessions.map((s) => ({ id: s.id, ...result.get(s.id)! }));
}
