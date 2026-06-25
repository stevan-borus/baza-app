import { describe, expect, test } from "vitest";
import { resolveServerConfig } from "@/server/config";

describe("resolveServerConfig", () => {
  test("defaults port to 8081 when PORT is unset", () => {
    const config = resolveServerConfig({ env: {}, cwd: "/app" });
    expect(config.port).toBe(8081);
  });

  test("reads PORT from the environment", () => {
    const config = resolveServerConfig({ env: { PORT: "3000" }, cwd: "/app" });
    expect(config.port).toBe(3000);
  });

  test("falls back to 8081 when PORT is not a number", () => {
    const config = resolveServerConfig({ env: { PORT: "not-a-port" }, cwd: "/app" });
    expect(config.port).toBe(8081);
  });

  test("binds 0.0.0.0 so Fly's proxy can reach the container", () => {
    const config = resolveServerConfig({ env: {}, cwd: "/app" });
    expect(config.host).toBe("0.0.0.0");
  });

  test("points the build dir at the exported server output under cwd", () => {
    const config = resolveServerConfig({ env: {}, cwd: "/app" });
    expect(config.buildDir).toBe("/app/dist/server");
  });

  test("points the client dir at the exported static client output under cwd", () => {
    // The static client output (public/ assets, incl. /.well-known/* universal-link
    // files) lives in dist/client and must be served by express.static — the Expo
    // request handler only covers dist/server (API + SSR), so without this every
    // static asset 404s.
    const config = resolveServerConfig({ env: {}, cwd: "/app" });
    expect(config.clientDir).toBe("/app/dist/client");
  });
});
