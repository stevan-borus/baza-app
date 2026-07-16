/**
 * Client-side Sentry init for the Expo/React-Native app.
 *
 * Kept behind a tiny seam so the noisy init config lives in one place and
 * `_layout.tsx` just calls `initSentry()` + wraps its root. No-ops when the DSN
 * is unset (dev without a DSN, tests) so nothing is reported there.
 *
 * Sample rates are tuned for the Sentry free (Developer) plan, whose tightest
 * quota is 50 session replays/month: we never sample idle sessions
 * (`replaysSessionSampleRate: 0`) and only capture a replay when an error
 * happens (`replaysOnErrorSampleRate: 1`). Tracing is generous (5M spans) so
 * 0.2 in prod is safe. Profiling is intentionally omitted — it is not on the
 * free plan.
 */
import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",

    // Errors: always on (implicit). Tracing: sampled.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,

    // Session Replay — free plan allows only 50/mo, so never sample idle
    // sessions; capture one only when an error occurs.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Structured logs (Sentry.logger.*), correlated to traces.
    enableLogs: true,

    // Don't attach IP/cookies/user identifiers by default — flip on if we
    // decide we want per-user attribution.
    sendDefaultPii: false,

    integrations: [Sentry.mobileReplayIntegration()],
  });
}
