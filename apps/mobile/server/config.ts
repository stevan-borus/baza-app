import path from "node:path";

export type ServerConfig = {
  port: number;
  host: string;
  buildDir: string;
  clientDir: string;
};

const DEFAULT_PORT = 8081;

/**
 * Resolves the runtime config for the production Node server that serves
 * Expo's `dist/server` output on Fly.io.
 *
 * Kept as a pure function (env + cwd in, config out) so it can be unit-tested
 * without booting a listener — see test/unit/server-entry.test.ts.
 */
export function resolveServerConfig({
  env,
  cwd,
}: {
  env: Record<string, string | undefined>;
  cwd: string;
}): ServerConfig {
  const parsedPort = Number.parseInt(env.PORT ?? "", 10);
  const port = Number.isInteger(parsedPort) ? parsedPort : DEFAULT_PORT;

  return {
    port,
    // Fly's proxy reaches the container over its private network, so the
    // listener must bind all interfaces, not just loopback.
    host: "0.0.0.0",
    buildDir: path.join(cwd, "dist", "server"),
    // The exported static client assets (public/ files, incl. /.well-known/*)
    // live here and are served via express.static — the Expo request handler
    // only covers the server build.
    clientDir: path.join(cwd, "dist", "client"),
  };
}
