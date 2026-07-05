// Production entry for the Fly.io container. Serves Expo Router's `dist/server`
// output (built by `expo export -p web`) through the documented Express adapter.
// See https://docs.expo.dev/router/web/api-routes/#deployment for the pattern.
//
// Plain JS (not TS) so it runs under Node directly with no build step in the
// container. The testable config lives in ./config.ts and ./sentry.ts, mirrored
// here.

// Sentry MUST be initialized before Express is required/used so its auto
// instrumentation can patch the framework. Disabled (no-op) when SENTRY_DSN is
// unset — local/dev/CI report nothing. Mirrors resolveSentryConfig in
// ./sentry.ts (kept in sync by test/unit/server-sentry.test.ts).
const Sentry = require("@sentry/node");
const sentryDsn = (process.env.SENTRY_DSN || "").trim();
if (sentryDsn) {
  const environment = (process.env.NODE_ENV || "").trim() || "production";
  Sentry.init({
    dsn: sentryDsn,
    environment,
    tracesSampleRate: environment === "development" ? 1.0 : 0.2,
    enableLogs: true,
    sendDefaultPii: false,
  });
}

const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const { createRequestHandler } = require("expo-server/adapter/express");

const DEFAULT_PORT = 8081;

const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const port = Number.isInteger(parsedPort) ? parsedPort : DEFAULT_PORT;
const host = "0.0.0.0";
const buildDir = path.join(process.cwd(), "dist", "server");
const clientDir = path.join(process.cwd(), "dist", "client");

if (!fs.existsSync(buildDir)) {
  process.stderr.write(
    `[server] missing build output at ${buildDir} — run \`expo export -p web\` first\n`,
  );
  process.exit(1);
}

const app = express();

// Serve the exported static client assets (public/ files, incl. the
// /.well-known/* universal-link files) before the Expo handler — the handler
// only covers dist/server (API + SSR), so without this every static asset 404s.
// apple-app-site-association has no extension, so express.static can't infer its
// type; force application/json (Apple requires JSON, no .json suffix).
app.use(
  express.static(clientDir, {
    // express.static ignores dot-prefixed paths by default, which would skip the
    // entire /.well-known/ directory (AASA + assetlinks) and fall through to a 404.
    dotfiles: "allow",
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) === "apple-app-site-association") {
        res.setHeader("Content-Type", "application/json");
      }
    },
  }),
);

app.all(
  "/{*all}",
  createRequestHandler({
    build: buildDir,
  }),
);

// Must be registered AFTER all routes/controllers so it sees their errors. No-op
// when Sentry wasn't initialized (no DSN).
if (sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}

app.listen(port, host, () => {
  process.stdout.write(`[server] baza-api listening on ${host}:${port}\n`);
});
