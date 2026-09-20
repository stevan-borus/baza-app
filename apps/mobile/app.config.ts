import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config: starts from the static app.json and overlays the
 * Universal Link / App Link domain from an env var so dev / staging / prod can
 * each point at the right host without editing committed config.
 *
 *   - dev:  a public HTTPS tunnel (e.g. `npx expo start --tunnel`, with
 *           EXPO_TUNNEL_SUBDOMAIN pinned) → EXPO_PUBLIC_LINK_HOST=<sub>.ngrok.io
 *   - prod: your real domain (the host of APP_WEB_URL).
 *
 * The host MUST be a bare hostname — no scheme, no path (Apple/Android both
 * reject a protocol in the associated-domain value). See
 * public/.well-known/README.md for the full testing runbook.
 */

// Bare hostname only. Empty string = links disabled (no associatedDomains /
// intentFilters emitted), which is the safe default before a domain is chosen.
const LINK_HOST = (process.env.EXPO_PUBLIC_LINK_HOST ?? "").trim();

// Paths in our transactional emails that should open the app when installed.
const LINK_PATHS = ["/accept-invite", "/reset-password"];

export default ({ config }: ConfigContext): ExpoConfig => {
  const base: ExpoConfig = {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      // EAS writes the GOOGLE_SERVICES_JSON file secret outside the project and
      // exports its absolute path, so it has to win over app.json's relative
      // fallback (which is what a local build with your own copy uses).
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
    },
  };

  if (!LINK_HOST) return base;

  return {
    ...base,
    ios: {
      ...base.ios,
      associatedDomains: [`applinks:${LINK_HOST}`],
    },
    android: {
      ...base.android,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: LINK_PATHS.map((pathPrefix) => ({
            scheme: "https",
            host: LINK_HOST,
            pathPrefix,
          })),
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
  };
};
