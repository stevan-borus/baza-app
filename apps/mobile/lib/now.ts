/**
 * Anchor-time helper.
 *
 * Single source of "current time" for the entire stack. When the
 * `TEST_ANCHOR_TIME` env var is set to a parseable ISO instant, every
 * caller resolves to that pinned moment; otherwise the helper falls back
 * to `new Date()` / `Date.now()`. This lets the test layer freeze seed,
 * server, helpers and browser to a single instant so date-dependent
 * specs stop drifting over wall-clock time.
 *
 * Per-call lookup of `process.env` is intentional — Vitest mutates
 * env vars between tests and we want each call to honour the latest value.
 *
 * See CONTEXT.md → "Anchor time".
 */

function readAnchorMs(): number | null {
  const raw = process.env.TEST_ANCHOR_TIME;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function now(): Date {
  const anchor = readAnchorMs();
  return anchor === null ? new Date() : new Date(anchor);
}

export function nowMs(): number {
  const anchor = readAnchorMs();
  return anchor === null ? Date.now() : anchor;
}
