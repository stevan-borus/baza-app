# Universal Links / App Links — association files & testing runbook

These two files let iOS and Android verify that a domain may open the native app
for `/accept-invite` and `/reset-password` links (the URLs in our invite and
password-reset emails). Expo Router serves `public/` at the site root, so they're
reachable at:

- `https://<host>/.well-known/apple-app-site-association` (no extension)
- `https://<host>/.well-known/assetlinks.json`

The associated domain itself is **not** hardcoded — `app.config.ts` injects it
from `EXPO_PUBLIC_LINK_HOST` (a bare hostname) into `ios.associatedDomains` and
`android.intentFilters`. Empty host = links disabled. This is what lets you point
dev at a tunnel and prod at the real domain without editing committed config.

> You do **not** need a published app or the production domain to test this.
> Expo's documented dev workflow uses an HTTPS tunnel + a development build on a
> real device. See Tier 1 below.

## Signing identities (filled in)

Both files now carry the real production identities:

- **iOS** — `apple-app-site-association` uses the Apple Developer **Team ID**
  (`DP99QDPC3A`, 10 chars from Apple Developer portal → Membership) as the
  `<TeamID>.com.bazapilates.app` appID. Required even for a dev build's
  `applinks` entitlement.
- **Android** — `assetlinks.json` carries the SHA-256 of the EAS-managed
  release signing key (regenerated under `com.bazapilates.app`). Re-read it any
  time with:
  ```sh
  eas credentials -p android   # read "SHA256 Fingerprint"
  ```
  For a local `expo run:android` debug build you'd use the debug keystore's
  fingerprint instead. With Google Play App Signing, include **both** the upload
  key and the Play-managed app-signing key fingerprints (Play Console → App
  integrity).

## Tier 1 — verify in development (real device, no publish, no prod domain)

Per [Expo iOS Universal Links](https://docs.expo.dev/linking/ios-universal-links/)
and [Android App Links](https://docs.expo.dev/linking/android-app-links/) docs.
Expo Go can't test linking — you need a **development build**.

1. Pin a stable tunnel subdomain so the URL survives restarts:
   ```sh
   export EXPO_TUNNEL_SUBDOMAIN=baza-dev          # → baza-dev.ngrok.io
   export EXPO_PUBLIC_LINK_HOST=baza-dev.ngrok.io # app.config.ts reads this
   ```
2. Fill the Team ID (iOS) and debug SHA-256 (Android) placeholders above.
3. Start the tunnel (serves the real `.well-known/` files over public HTTPS):
   ```sh
   npx expo start --tunnel
   ```
4. Build & install the dev build on a **real device** (not a simulator/emulator —
   AASA verification is unreliable there):
   ```sh
   npx expo run:ios      # or run:android
   ```
5. Test the link:
   - **iOS:** type `https://baza-dev.ngrok.io/accept-invite?token=demo` into
     Safari → the app should open to the activation screen.
   - **Android:** (verification can take 20+ seconds after install)
     ```sh
     adb shell am start -a android.intent.action.VIEW \
       -c android.intent.category.BROWSABLE \
       -d "https://baza-dev.ngrok.io/accept-invite?token=demo"
     ```
6. Validate the AASA file format with a validator
   (e.g. https://branch.io/resources/aasa-validator/) if iOS won't open it.

## Tier 2 — staging / preview

EAS build against a staging domain. Set `EXPO_PUBLIC_LINK_HOST=<staging-host>`,
deploy the `.well-known/` files there, use the EAS-managed SHA-256.

## Tier 3 — production (launch checklist)

- [ ] `EXPO_PUBLIC_LINK_HOST` = the host of `APP_WEB_URL`.
- [ ] iOS Team ID filled in `apple-app-site-association`.
- [ ] Release + Play-App-Signing SHA-256 fingerprints in `assetlinks.json`.
- [ ] `.well-known/` files deployed to the prod domain over HTTPS,
      `assetlinks.json` served as `content-type: application/json`.
- [ ] Validate (Apple AASA validator; Android Digital Asset Links API), then
      install a store build and tap a real invite email link → app opens.

Until any tier is wired up, the email route fix and the web "Get the app" store
banner are fully functional on their own — only the *open-the-app-directly*
behavior depends on the steps above.
