import { describe, expect, it } from "vitest";
import {
  API_RATE_LIMIT,
  API_RATE_WINDOW_MS,
  clientIp,
  createRateLimiter,
  throttleResponse,
} from "@/lib/server/rate-limit";

// A hand-cranked clock. Real sleeps would make a window test take a literal
// minute and turn a deterministic assertion into a flaky one.
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows exactly `limit` requests inside the window", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: clock.now,
    });
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("blocks the request after the limit with a positive retryAfterSeconds", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      now: clock.now,
    });
    limiter.check("ip");
    limiter.check("ip");
    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts down retryAfterSeconds as the oldest timestamp ages out", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: clock.now,
    });
    limiter.check("ip");
    expect(limiter.check("ip").retryAfterSeconds).toBe(60);
    clock.advance(30_000);
    expect(limiter.check("ip").retryAfterSeconds).toBe(30);
  });

  it("never reports a retryAfterSeconds below 1", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: clock.now,
    });
    limiter.check("ip");
    clock.advance(59_900);
    expect(limiter.check("ip").retryAfterSeconds).toBe(1);
  });

  it("slides the window — the key is allowed again once the oldest timestamp expires", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      now: clock.now,
    });
    limiter.check("ip");
    clock.advance(10_000);
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);

    // Past the first timestamp's window but not the second's: one slot frees.
    clock.advance(51_000);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("keeps keys independent", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: clock.now,
    });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("does not leak idle keys — memory is bounded as traffic rotates through IPs", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 5,
      windowMs: 60_000,
      now: clock.now,
    });
    for (let i = 0; i < 2_000; i++) {
      limiter.check(`ip-${i}`);
      clock.advance(1_000);
    }
    // Every key older than the window must have been swept, so the map can
    // only hold the ~60 keys seen in the last 60s.
    expect(limiter.size()).toBeLessThan(200);
  });

  it("exposes the API-wide limits as constants", () => {
    expect(API_RATE_LIMIT).toBe(600);
    expect(API_RATE_WINDOW_MS).toBe(60_000);
  });
});

describe("clientIp", () => {
  function req(headers: Record<string, string>) {
    return new Request("http://test.local/api/sessions", { headers });
  }

  it("prefers fly-client-ip", () => {
    expect(
      clientIp(
        req({
          "fly-client-ip": "1.1.1.1",
          "x-forwarded-for": "2.2.2.2",
          "x-real-ip": "3.3.3.3",
        }),
      ),
    ).toBe("1.1.1.1");
  });

  it("falls back to the first entry of x-forwarded-for", () => {
    expect(
      clientIp(
        req({
          "x-forwarded-for": "2.2.2.2, 4.4.4.4",
          "x-real-ip": "3.3.3.3",
        }),
      ),
    ).toBe("2.2.2.2");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });

  it('returns "unknown" when no forwarding header is present', () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("throttleResponse", () => {
  it("returns a 429 with a Retry-After header and a JSON body", async () => {
    const res = throttleResponse(17);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(await res.json()).toEqual({
      error: "Too many requests",
      retryAfterSeconds: 17,
    });
  });
});
