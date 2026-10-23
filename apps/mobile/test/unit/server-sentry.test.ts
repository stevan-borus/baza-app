import { readFileSync } from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
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

  // Drop logs before buffering; Sentry 11 no longer has an enableLogs switch.
  test("disables server log buffering", () => {
    const config = resolveSentryConfig({ env: { SENTRY_DSN: "x" } });
    expect(
      config.beforeSendLog({ level: "info", message: "Accidental log" }),
    ).toBeNull();
  });
});

type StartupOptions = {
  dataCollection?: unknown;
  beforeSendLog?: (log: { level: string; message: string }) => unknown;
};

function runServerStartup(env: Record<string, string | undefined>) {
  const app = { use: vi.fn(), all: vi.fn(), listen: vi.fn() };
  const express = Object.assign(vi.fn(() => app), { static: vi.fn() });
  const sentry = {
    init: vi.fn<(options: StartupOptions) => void>(),
    getDefaultIntegrationsWithoutPerformance: vi.fn(() => [
      { name: "Http" },
      { name: "OnUncaughtException" },
    ]),
    httpIntegration: vi.fn((options: { spans: boolean }) => ({
      name: "Http",
      options,
    })),
    setupExpressErrorHandler: vi.fn(),
  };

  runInNewContext(
    readFileSync(new URL("../../server/index.js", import.meta.url), "utf8"),
    {
      require: (id: string) => {
        switch (id) {
          case "@sentry/node":
            return sentry;
          case "node:path":
            return path;
          case "node:fs":
            return { existsSync: () => true };
          case "express":
            return express;
          case "expo-server/adapter/express":
            return { createRequestHandler: vi.fn() };
          default:
            throw new Error(`Unexpected server dependency: ${id}`);
        }
      },
      process: { env, cwd: () => "/server-test" },
    },
  );

  return { app, express, sentry };
}

describe("server Sentry startup", () => {
  test.each(["production", "development"])(
    "preserves restrictive v10 data collection in %s",
    (environment) => {
      const { sentry } = runServerStartup({
        SENTRY_DSN: "https://abc@o1.ingest.de.sentry.io/2",
        NODE_ENV: environment,
      });

      expect(sentry.init).toHaveBeenCalledOnce();
      expect(sentry.init.mock.calls[0][0].dataCollection).toEqual({
        userInfo: false,
        cookies: false,
        httpHeaders: {
          request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
          response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
        },
        httpBodies: [],
        urlQueryParams: {
          deny: ["forwarded", "-ip", "remote-", "via", "-user"],
        },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
      });
      expect(sentry.init.mock.calls[0][0]).not.toHaveProperty("sendDefaultPii");
    },
  );

  test.each(["production", "development"])(
    "drops accidental logger calls before buffering in %s",
    (environment) => {
      const { sentry } = runServerStartup({
        SENTRY_DSN: "https://abc@o1.ingest.de.sentry.io/2",
        NODE_ENV: environment,
      });
      const options = sentry.init.mock.calls[0][0];

      expect(options.beforeSendLog).toEqual(expect.any(Function));
      expect(
        options.beforeSendLog?.({ level: "info", message: "Accidental log" }),
      ).toBeNull();
      expect(options).not.toHaveProperty("enableLogs");
    },
  );

  test("keeps production error reporting without performance instrumentation", () => {
    const { app, express, sentry } = runServerStartup({
      SENTRY_DSN: "  https://abc@o1.ingest.de.sentry.io/2  ",
    });

    expect(sentry.init).toHaveBeenCalledWith({
      dsn: "https://abc@o1.ingest.de.sentry.io/2",
      environment: "production",
      tracesSampleRate: 0,
      defaultIntegrations: [
        { name: "OnUncaughtException" },
        { name: "Http", options: { spans: false } },
      ],
      dataCollection: expect.any(Object),
      beforeSendLog: expect.any(Function),
    });
    expect(sentry.setupExpressErrorHandler).toHaveBeenCalledWith(app);
    expect(sentry.init.mock.invocationCallOrder[0]).toBeLessThan(
      express.mock.invocationCallOrder[0],
    );
  });

  test("keeps full performance instrumentation in development", () => {
    const { sentry } = runServerStartup({
      SENTRY_DSN: "https://abc@o1.ingest.de.sentry.io/2",
      NODE_ENV: "development",
    });

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "development",
        tracesSampleRate: 1,
        defaultIntegrations: undefined,
      }),
    );
    expect(sentry.getDefaultIntegrationsWithoutPerformance).not.toHaveBeenCalled();
    expect(sentry.httpIntegration).not.toHaveBeenCalled();
  });

  test.each([undefined, "   "])("does not initialize with DSN %s", (dsn) => {
    const { sentry } = runServerStartup({ SENTRY_DSN: dsn });

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.setupExpressErrorHandler).not.toHaveBeenCalled();
  });
});
