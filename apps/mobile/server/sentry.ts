/**
 * Pure resolver for the production server's Sentry config (env in, config out)
 * so it can be unit-tested without importing @sentry/node or booting anything —
 * see test/unit/server-sentry.test.ts. The actual Sentry.init() call lives in
 * server/index.js and mirrors these values (index.js runs raw under Node with
 * no build step, same split as server/config.ts ↔ index.js).
 *
 * Disabled when SENTRY_DSN is unset (local/dev/CI) so nothing is reported there.
 */
export type SentryServerConfig = {
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  tracesSampleRate: number;
  /**
   * Whether to load Sentry's performance/OpenTelemetry instrumentation set
   * (http, express, fs, all the DB integrations). `false` selects
   * `getDefaultIntegrationsWithoutPerformance()` in index.js — error reporting
   * stays, tracing spans go away. Off in prod: that instrumentation was the
   * bulk of the server's ~344MB idle RSS on a 512MB Fly box, tipping it into
   * exit-134 aborts under any burst. On in dev where the footprint is
   * irrelevant and traces are useful.
   */
  performanceInstrumentation: boolean;
  /** Sentry log buffering — off on the server (memory cost, no pilot value). */
  enableLogs: boolean;
};

export function resolveSentryConfig({
  env,
}: {
  env: Record<string, string | undefined>;
}): SentryServerConfig {
  const dsn = env.SENTRY_DSN?.trim() || undefined;
  const environment = env.NODE_ENV?.trim() || "production";
  const isDev = environment === "development";
  // Production keeps ERROR reporting but drops performance tracing entirely:
  // the OTel instrumentation Sentry loads for tracing dominated the server's
  // RSS and, on the 512MB staging box, made it OOM-abort under load. Dev keeps
  // full tracing where volume is tiny and traces are most useful.
  const tracesSampleRate = isDev ? 1.0 : 0;

  return {
    enabled: Boolean(dsn),
    dsn,
    environment,
    tracesSampleRate,
    performanceInstrumentation: isDev,
    enableLogs: false,
  };
}
