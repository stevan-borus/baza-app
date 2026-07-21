import path from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@baza/types": path.resolve(__dirname, "../../packages/types/src"),
      "@baza/i18n": path.resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        extends: true,
        // Component tests mount real RN components in Chromium via
        // react-native-web — the same rendering path Playwright e2e uses,
        // minus the app shell, server, and DB.
        //
        // `lib/now` (and friends) read process.env per call; the browser has
        // no process global, so give them an empty env → real clock.
        define: {
          "process.env": JSON.stringify({}),
          __DEV__: "false",
        },
        resolve: {
          // Native-only chrome (gestures, sheet physics, animations,
          // haptics) can't load outside Metro — stubbed at the package
          // boundary. Everything of OURS renders real. See stubs/*.
          //
          // Array form with a regex first: the root "@" prefix alias would
          // otherwise swallow "@/lib/auth-client" before the stub matches
          // (alias resolution is first-match, no chaining).
          alias: [
            {
              find: /^@\/lib\/auth-client$/,
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/auth-client.ts",
              ),
            },
            {
              find: "@gorhom/bottom-sheet",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/gorhom-bottom-sheet.tsx",
              ),
            },
            {
              find: "react-native-reanimated",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/reanimated.ts",
              ),
            },
            {
              find: "moti",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/moti.tsx",
              ),
            },
            {
              find: "react-native-safe-area-context",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/safe-area-context.tsx",
              ),
            },
            {
              find: "uniwind",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/uniwind.ts",
              ),
            },
            {
              find: "expo-haptics",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/expo-haptics.ts",
              ),
            },
            {
              find: "expo-router",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/expo-router.ts",
              ),
            },
            {
              find: "expo-blur",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/expo-blur.tsx",
              ),
            },
            {
              find: "react-native-modal-datetime-picker",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/modal-datetime-picker.tsx",
              ),
            },
            {
              find: /^expo-modules-core$/,
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/expo-modules-core.ts",
              ),
            },
            {
              find: "react-native-svg",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/react-native-svg.tsx",
              ),
            },
            {
              find: "lucide-react-native",
              replacement: path.resolve(
                __dirname,
                "test/component/stubs/lucide-react-native.tsx",
              ),
            },
            { find: "react-native", replacement: "react-native-web" },
          ],
          // Metro resolves platform files (.web.js) first; mirror that so RN
          // libraries pick their web implementations instead of deep-importing
          // react-native internals that don't exist in react-native-web.
          extensions: [
            ".web.tsx",
            ".web.ts",
            ".web.jsx",
            ".web.js",
            ".tsx",
            ".ts",
            ".jsx",
            ".js",
            ".json",
          ],
        },
        test: {
          name: "component",
          include: ["test/component/**/*.browser.test.tsx"],
          setupFiles: ["./test/component/setup.ts"],
          isolate: true,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
          deps: {
            optimizer: {
              web: {
                // These RN libraries deep-import react-native internals in
                // their .js files but ship .web.js siblings; the optimizer's
                // resolver ignores our .web-first extensions, so serve them
                // unbundled through the project resolver instead.
                exclude: [
                  "react-native-gesture-handler",
                  "react-native-reanimated",
                  "react-native-safe-area-context",
                  "@gorhom/bottom-sheet",
                  "moti",
                  // Imports expo-constants/expo-linking internally; keeping it
                  // out of the optimizer lets those hit our stub aliases.
                  "@better-auth/expo",
                ],
              },
            },
          },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["./test/integration/env.setup.ts"],
          // Avoid parallel DB races — each test mutates shared tables.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
