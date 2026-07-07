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

  // Performance tracing is disabled in production: the OpenTelemetry
  // instrumentation @sentry/node loads for tracing was inflating the server's
  // idle RSS to ~344MB on a 512MB Fly box and pushing it into exit-134 aborts
  // under any burst. We keep ERROR reporting (the point of Sentry for the pilot)
  // and drop tracing. Dev keeps full tracing where volume is tiny and it's most
  // useful.
  test("disables trace sampling in production but keeps it on in development", () => {
    const prod = resolveSentryConfig({
      env: { SENTRY_DSN: "x", NODE_ENV: "production" },
    });
    const dev = resolveSentryConfig({
      env: { SENTRY_DSN: "x", NODE_ENV: "development" },
    });
    expect(prod.tracesSampleRate).toBe(0);
    expect(dev.tracesSampleRate).toBe(1.0);
  });

  // In production we also drop the heavy performance/OTel instrumentations
  // (http, express, fs, all the DB ones we don't use) via
  // getDefaultIntegrationsWithoutPerformance — that's the ~200MB of the RSS
  // bloat. Dev keeps the full default set. The resolver signals this so
  // index.js can pick the integration set without duplicating the env logic.
  test("drops performance instrumentation in production, keeps it in development", () => {
    expect(
      resolveSentryConfig({ env: { SENTRY_DSN: "x", NODE_ENV: "production" } })
        .performanceInstrumentation,
    ).toBe(false);
    expect(
      resolveSentryConfig({ env: { SENTRY_DSN: "x", NODE_ENV: "development" } })
        .performanceInstrumentation,
    ).toBe(true);
  });

  // Log buffering (enableLogs) is off everywhere on the server — it added
  // memory pressure with no pilot value.
  test("disables server log buffering", () => {
    expect(resolveSentryConfig({ env: { SENTRY_DSN: "x" } }).enableLogs).toBe(
      false,
    );
  });
});
