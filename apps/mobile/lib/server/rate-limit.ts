/**
 * In-memory sliding-window rate limiter for the API.
 *
 * Deliberately dependency-free and process-local. The studio runs a single Fly
 * machine, so one process's view of the traffic IS the traffic; a shared store
 * (Redis) would buy nothing but an extra thing to keep alive. If the app ever
 * scales past one machine the limit becomes per-machine, which is still a
 * ceiling, just a looser one.
 *
 * Sliding rather than fixed-bucket: a fixed bucket lets a caller spend the
 * whole allowance at the end of one window and again at the start of the next,
 * so the real burst is 2x the limit right where it hurts.
 */
import { nowMs } from "@/lib/now";

export const API_RATE_LIMIT = 600;
export const API_RATE_WINDOW_MS = 60_000;

/** Sweep idle keys once the map passes this many entries. */
const SWEEP_KEY_THRESHOLD = 1000;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check(key: string): RateLimitResult;
  /** Number of tracked keys. Exposed so tests can pin the memory bound. */
  size(): number;
};

export function createRateLimiter({
  limit,
  windowMs,
  now = nowMs,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  function prune(timestamps: number[], cutoff: number): number[] {
    // Timestamps are appended in order, so the survivors are a suffix.
    let i = 0;
    while (i < timestamps.length && timestamps[i]! <= cutoff) i++;
    return i === 0 ? timestamps : timestamps.slice(i);
  }

  function sweep(cutoff: number): void {
    for (const [key, timestamps] of hits) {
      const live = prune(timestamps, cutoff);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }

  return {
    check(key) {
      const at = now();
      const cutoff = at - windowMs;

      // Bound memory: every IP that ever hits the API gets an entry, and a
      // scanner rotating source addresses would otherwise grow the map without
      // limit. Sweeping is O(keys), so it's gated on size and frequency.
      if (hits.size > SWEEP_KEY_THRESHOLD && at - lastSweep >= windowMs) {
        sweep(cutoff);
        lastSweep = at;
      }

      const timestamps = prune(hits.get(key) ?? [], cutoff);

      if (timestamps.length >= limit) {
        hits.set(key, timestamps);
        const oldest = timestamps[0]!;
        const msUntilFree = oldest + windowMs - at;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(msUntilFree / 1000)),
        };
      }

      timestamps.push(at);
      hits.set(key, timestamps);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size() {
      return hits.size;
    },
  };
}

/**
 * Best-effort caller identity. Fly's proxy sets `Fly-Client-IP` on every
 * request it forwards, so that header is authoritative in production; the
 * others cover local/dev proxies. Falls back to a single shared bucket rather
 * than letting header-less requests through unlimited.
 */
export function clientIp(request: Request): string {
  const fly = request.headers.get("fly-client-ip");
  if (fly) return fly.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}

export function throttleResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

// Cache on globalThis for the same reason as prisma/auth: the consolidated
// server runs several bundles in one Node process, each with its own copy of
// this module. A module-scope singleton would give every bundle its own
// counter, so the effective limit would be N x the configured one.
const globalForRateLimit = globalThis as unknown as {
  apiRateLimiter?: RateLimiter;
};

export const apiRateLimiter = (globalForRateLimit.apiRateLimiter ??=
  createRateLimiter({
    limit: API_RATE_LIMIT,
    windowMs: API_RATE_WINDOW_MS,
  }));
