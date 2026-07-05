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
};

export function resolveSentryConfig({
  env,
}: {
  env: Record<string, string | undefined>;
}): SentryServerConfig {
  const dsn = env.SENTRY_DSN?.trim() || undefined;
  const environment = env.NODE_ENV?.trim() || "production";
  // 5M spans/mo on the free plan is generous, but sample down in prod anyway;
  // full sampling in dev where volume is tiny and traces are most useful.
  const tracesSampleRate = environment === "development" ? 1.0 : 0.2;

  return {
    enabled: Boolean(dsn),
    dsn,
    environment,
    tracesSampleRate,
  };
}
