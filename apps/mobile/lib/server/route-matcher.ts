// Pure URL-pattern matcher for the consolidated API dispatcher.
//
// Why this exists: `expo export` bundles every `app/api/**+api.ts` route as its
// own ~8.7MB self-contained server bundle (full Prisma + pg graph duplicated
// per route). In one long-lived Node process each route's first hit retains
// another whole module graph, staircasing RSS until the box OOMs. Consolidating
// all handlers behind ONE catch-all route (`app/api/[...rest]+api.ts`) collapses
// that to a single shared bundle — but then WE own the routing that expo-server
// used to do. This module reproduces expo-server's route-matching semantics
// (see node_modules/expo-server/build/cjs/vendor/abstract.js + utils/matchers.js)
// closely enough that moving a handler behind the catch-all is behavior-neutral.
//
// Route-file paths (relative to server/routes, without the .ts extension) use
// expo's bracket convention:
//   "sessions"            -> /api/sessions
//   "sessions/[id]"       -> /api/sessions/[id]      ([id] = single dynamic seg)
//   "legal/documents/[key]"                          (dynamic can be nested)
// We do NOT emit [...rest] patterns here — the catch-all itself is the ONLY
// deep-dynamic route and it is the last-resort in expo's own ordering.

/** One segment of a route pattern. */
type PatternSegment = { kind: "static"; value: string } | { kind: "param"; name: string };

export type RoutePattern = {
  /** The route-file key, e.g. "sessions/[id]". */
  readonly key: string;
  readonly segments: readonly PatternSegment[];
};

const DYNAMIC_SEGMENT = /^\[([^.\][]+)\]$/;
const DEEP_DYNAMIC_SEGMENT = /^\[\.\.\.([^.\][]+)\]$/;

/**
 * Build a matchable pattern from a route-file key such as "sessions/[id]".
 * Throws on a deep-dynamic ([...x]) segment — those are not registry entries;
 * the single catch-all owns deep matching.
 */
export function toRoutePattern(key: string): RoutePattern {
  const segments = key.split("/").map<PatternSegment>((raw) => {
    if (DEEP_DYNAMIC_SEGMENT.test(raw)) {
      throw new Error(
        `Deep-dynamic segment "${raw}" is not a valid registry route key (key: ${key})`
      );
    }
    const dynamic = raw.match(DYNAMIC_SEGMENT);
    if (dynamic) return { kind: "param", name: dynamic[1] };
    return { kind: "static", value: raw };
  });
  return { key, segments };
}

/** The URL path segments of a pathname under /api, e.g. /api/sessions/x -> ["sessions","x"]. */
function apiPathSegments(pathname: string): string[] | null {
  // expo-server matches against the raw pathname with a trailing-slash-optional
  // suffix `(?:/)?$`. Normalize a single optional trailing slash the same way,
  // then require the /api/ prefix. An empty path or a bare "/api" is not a
  // route we own.
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "/api" || p === "/api/") return [];
  if (!p.startsWith("/api/")) return null;
  const rest = p.slice("/api/".length);
  if (rest === "") return [];
  return rest.split("/");
}

/**
 * Result of matching a pathname against a pattern: the extracted params, plus a
 * specificity vector used to break ties when several patterns match. Higher is
 * more specific. expo-server relies on manifest ordering (static routes emitted
 * before dynamic before deep-dynamic); we make the precedence explicit instead
 * of depending on registry insertion order: a static segment beats a param
 * segment at the same position.
 */
type SegmentMatch = {
  params: Record<string, string>;
  /** Per-segment specificity: 1 = static, 0 = param. Compared left-to-right. */
  specificity: number[];
};

function matchPattern(pattern: RoutePattern, pathSegments: string[]): SegmentMatch | null {
  if (pattern.segments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  const specificity: number[] = [];
  for (let i = 0; i < pattern.segments.length; i++) {
    const seg = pattern.segments[i];
    const value = pathSegments[i];
    if (seg.kind === "static") {
      if (seg.value !== value) return null;
      specificity.push(1);
    } else {
      // A dynamic segment cannot match an empty segment (expo's [^/]+? is
      // non-empty). A repeated bare "//" produces an empty segment.
      if (value === "") return null;
      // Parity note: expo-server's parseParams does NOT decodeURIComponent the
      // captured value — it uses the raw namedRegex group. We match that exactly
      // so a handler sees the same param string it does today in production.
      params[seg.name] = value;
      specificity.push(0);
    }
  }
  return { params, specificity };
}

/** Compare two specificity vectors; returns >0 if `a` is more specific than `b`. */
function compareSpecificity(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export type MatchedRoute = {
  key: string;
  params: Record<string, string>;
};

/**
 * Match a pathname against a set of route patterns, returning the most-specific
 * match (static wins over param at each position, left-to-right) or null.
 * Only `/api/...` paths are considered; anything else returns null (the catch-all
 * itself is only ever invoked by expo-router for `/api/*`, but we stay defensive).
 */
export function matchRoute(
  pathname: string,
  patterns: readonly RoutePattern[]
): MatchedRoute | null {
  const pathSegments = apiPathSegments(pathname);
  if (pathSegments === null) return null;

  let best: { pattern: RoutePattern; match: SegmentMatch } | null = null;
  for (const pattern of patterns) {
    const match = matchPattern(pattern, pathSegments);
    if (!match) continue;
    if (best === null || compareSpecificity(match.specificity, best.match.specificity) > 0) {
      best = { pattern, match };
    }
  }
  if (!best) return null;
  return { key: best.pattern.key, params: best.match.params };
}
