// Production entry for the Fly.io container. Serves Expo Router's `dist/server`
// output (built by `expo export -p web`) through the documented Express adapter.
// See https://docs.expo.dev/router/web/api-routes/#deployment for the pattern.
//
// Plain JS (not TS) so it runs under Node directly with no build step in the
// container. The testable config lives in ./config.ts and is mirrored here.
const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const { createRequestHandler } = require("expo-server/adapter/express");

const DEFAULT_PORT = 8081;

const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const port = Number.isInteger(parsedPort) ? parsedPort : DEFAULT_PORT;
const host = "0.0.0.0";
const buildDir = path.join(process.cwd(), "dist", "server");

if (!fs.existsSync(buildDir)) {
  process.stderr.write(
    `[server] missing build output at ${buildDir} — run \`expo export -p web\` first\n`,
  );
  process.exit(1);
}

const app = express();

app.all(
  "/{*all}",
  createRequestHandler({
    build: buildDir,
  }),
);

app.listen(port, host, () => {
  process.stdout.write(`[server] baza-api listening on ${host}:${port}\n`);
});
