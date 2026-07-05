import { describe, expect, test } from "vitest";
import { resolveSentryConfig } from "@/server/sentry";

describe("resolveSentryConfig", () => {
  test("is disabled when SENTRY_DSN is unset", () => {
    const config = resolveSentryConfig({ env: {} });
    expect(config.enabled).toBe(false);
    expect(config.dsn).toBeUndefined();
  });

  test("is disabled when SENTRY_DSN is blank/whitespace", () => {
    const config = resolveSentryConfig({ env: { SENTRY_DSN: "   " } });
    expect(config.enabled).toBe(false);
  });

  test("is enabled with a trimmed DSN when SENTRY_DSN is set", () => {
    const config = resolveSentryConfig({
      env: { SENTRY_DSN: "  https://abc@o1.ingest.de.sentry.io/2  " },
    });
    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://abc@o1.ingest.de.sentry.io/2");
  });

  test("defaults environment to production and reads NODE_ENV when set", () => {
    expect(resolveSentryConfig({ env: { SENTRY_DSN: "x" } }).environment).toBe(
      "production",
    );
    expect(
      resolveSentryConfig({ env: { SENTRY_DSN: "x", NODE_ENV: "staging" } })
        .environment,
    ).toBe("staging");
  });

  test("uses a lower trace sample rate in production than in development", () => {
    const prod = resolveSentryConfig({
      env: { SENTRY_DSN: "x", NODE_ENV: "production" },
    });
    const dev = resolveSentryConfig({
      env: { SENTRY_DSN: "x", NODE_ENV: "development" },
    });
    expect(prod.tracesSampleRate).toBeLessThan(dev.tracesSampleRate);
    expect(prod.tracesSampleRate).toBeGreaterThan(0);
  });
});
