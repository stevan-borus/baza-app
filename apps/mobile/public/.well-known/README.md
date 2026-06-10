# Universal Links / App Links association files

These two files let iOS and Android verify that this domain is allowed to open
the native app for `/accept-invite` and `/reset-password` links (the URLs in our
invite and password-reset emails). Expo Router serves `public/` at the site root,
so they're reachable at:

- `https://<domain>/.well-known/apple-app-site-association` (no extension)
- `https://<domain>/.well-known/assetlinks.json`

## ⚠️ Placeholders — must be filled before universal links work on device

Both files ship with placeholders because the app isn't published yet. The OS
verifies these against the **real signing identity**, so app-open behavior cannot
be tested until they're replaced.

### Checklist (do once the app has a signing identity)

- [ ] **iOS** — replace `TEAMID_PLACEHOLDER` in `apple-app-site-association` with
      the Apple Developer **Team ID** (10 chars, from the Apple Developer portal /
      `eas.json` once it exists). The bundle id is already correct
      (`com.steva.borus.baza-pilates`).
- [ ] **Android** — replace `SHA256_RELEASE_FINGERPRINT_PLACEHOLDER` in
      `assetlinks.json` with the SHA-256 fingerprint of the **release signing key**.
      If using Google Play App Signing, include **both** the upload key and the
      Play-managed app-signing key fingerprints (get them from
      Play Console → App integrity).
- [ ] **app.json** — set `expo.ios.associatedDomains` to `applinks:<your-domain>`
      and the host in `expo.android.intentFilters[].data.host` to `<your-domain>`
      (currently `app.example.com` placeholder; should match the host of
      `APP_WEB_URL`).
- [ ] Deploy these files to production, then validate:
      - iOS: Apple's AASA validator / `swcutil` on device.
      - Android: `https://<domain>/.well-known/assetlinks.json` reachable + the
        Digital Asset Links API.
- [ ] Install a real build and tap an invite email link → app opens to activation.

Until then: the email route fix and the web "Get the app" store banner are fully
functional; only the *open-the-app-directly* behavior waits on this checklist.
