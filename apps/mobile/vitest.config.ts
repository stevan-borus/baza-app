import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest projects:
 *  - "unit"        — pure functions, no DB. Fast, runs in parallel.
 *  - "integration" — API-route handlers exercised against a live test DB
 *    (DATABASE_URL must point at a writable postgres). Runs serially per file.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@baza/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@baza/i18n": path.resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          environment: "node",
          // Loaded before any application module so env-validating imports pass.
          setupFiles: ["./test/integration/env.setup.ts"],
          // Avoid parallel DB races — each integration test mutates shared tables.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
