# Legal Consent & Onboarding — Design Spec

**Date:** 2026-05-14
**Status:** Draft, pending user review
**Author:** Claude (brainstorming session with Stevan)

---

## Goal

Bring Baza Pilates Studio into compliance with Serbian *Zakon o zaštiti podataka o ličnosti* (ZZPL) and GDPR by collecting explicit, versioned, auditable consent from every user before they use the app. Replace the static "By continuing, you agree…" strip on the sign-in screen with a real legal flow that produces evidence.

## Non-goals

- Replacing existing paper waivers for minors (we keep both: digital + paper).
- Localising into languages other than Serbian (Latinica) and English.
- Building a CMS for documents — versions are checked into the repo as source.
- Implementing data-export / right-to-be-forgotten flows (separate effort).

## What changes for the user

### Language

- **Default:** Every account starts at `preferredLocale = sr` (Serbian). Stored on the User and applied app-wide (not just on the consent screen).
- **Auth screens (sign-in, accept-invite, reset-password):** A small language toggle is added to the legal strip at the bottom of `AuthBackground`, next to the version label. Tapping switches the app's locale immediately and writes it to `preferredLocale` once the user is authenticated.
- **Consent screen:** Header has the same toggle so the user can flip language while reading the documents. Toggle on consent screen also updates `preferredLocale`.
- **In-app:** The existing `LanguageSwitcher` in `ProfileSheet` continues to work; same source of truth (`preferredLocale`).

This replaces the previous design where admin picked a default locale at invite time.

### First login (or re-login after a document update)
After successful authentication, the app routes to `/consent` instead of the role home. The user sees a single scrollable screen with the documents that need acceptance, grouped:

1. **Required for everyone (gate):** ToS, Privacy Policy, EULA.
2. **Required for clients only (gate):** Izjava vežbača (waiver + house rules + data-processing consent).
3. **Required for clients only (must-answer):** Vaš životni ritam — health intake (see § Health intake below).
4. **Required for clients only (must-answer):** Social media consent — Da / Ne. The user must pick *one*, but the choice itself (Da or Ne) does not lock them out — only an *unanswered* state does. This is a soft gate: it blocks progression until a value is recorded.

If the client is a minor (derived from `dateOfBirth`, computed against `now()`), the Izjava and social-media sections render a **guardian block** instead: guardian fullName, guardian relationship (roditelj / staratelj), and the same checkbox plus a notice "Studio će tražiti potpis roditelja/staratelja na prvoj poseti."

When all required items are accepted, the "Nastavi" button enables and routes them to their role home. The required-but-not-gate social toggle must be answered (Da or Ne) before the button enables.

### Refusal
"Refusal" means dismissing the entire screen via "Odjavi se" (or hardware back) without accepting the required documents. Picking *Ne* on the social-media question is not a refusal — it's a recorded answer and the user proceeds normally. Only declining the *gate* documents (ToS, Privacy, EULA, Izjava) triggers sign-out and admin notification:

> *"<fullName> nije prihvatio/la pravne dokumente — možda ih treba kontaktirati."*

### Re-consent on version bump
When a document's version changes in the source repo, every user whose latest accepted version is older sees the gate again on next app open. Only the changed documents are listed (others remain accepted). The screen header reads "Ažurirali smo naše dokumente" with a short "Šta se promenilo" diff summary supplied by the document author.

### Profile sheet (not a screen)
The existing **`ProfileSheet`** (`apps/mobile/components/ui/profile-sheet.tsx`, opened from the avatar tap in `AppHeader`) gets two new sections, below the existing language/theme/email/sign-out blocks:

- **"Pravna dokumenta"** — list of currently-active documents with status (✓ Prihvaćeno DD.MM.YYYY / ⚠️ Potrebno ažuriranje), tap to view full text in a nested `AppSheet`, plus a toggle for "Dozvoljavam objavljivanje snimaka na društvenim mrežama" with current state. Toggling re-records the consent (new ConsentRecord row, old one preserved as audit history).
- **"Zdravstveni podaci"** — current intake answers in read-only form, "Izmeni" button opens a nested edit sheet, "Povuci saglasnost" link triggers the hard-delete + audit flow with a confirm step.

No new top-level screen is added for these. Trainers and admins don't use `ProfileSheet`, so their views (admin client detail page) keep dedicated sections as previously specified.

## What changes for the admin

- **Client detail page** gains a "Pravna dokumenta" panel: which docs accepted, which versions, when, and `guardianVerified` toggle for minors. Admin checks the box after collecting the paper signature at first visit. Also shows the latest health intake (read-only) with the four flags (pregnant/postpartum/complaints/injuries) prominently displayed.
- **Notifications inbox** receives the refusal alerts and the "minor needs paper waiver" alerts.

Invite creation does **not** get a language picker. Every new client starts at default `sr` (Serbian); the client switches it themselves on sign-in or in the profile sheet.

---

## Architecture

### Documents as source-controlled assets

Each document lives at `docs/legal/{sr,en}/<key>-v<version>.md`. The repo is the source of truth. At build time (or app start), the contents are bundled into the app and the active versions are registered in the DB.

```
docs/legal/
  sr/
    tos-v1.md
    privacy-v1.md
    eula-v1.md
    waiver-adult-v1.md
    waiver-minor-v1.md
  en/
    tos-v1.md
    ...
```

A document is identified by `(key, version, locale)`. `key` ∈ `{ tos, privacy, eula, waiver-adult, waiver-minor }`. Versions are monotonically integer (v1, v2, …). When changing a document, **never** edit in place — copy to a new `-v2.md` and bump the version constant.

### Version registry

`apps/mobile/lib/legal/versions.ts` exports the currently-active version per key:

```ts
export const ACTIVE_VERSIONS = {
  tos: 1,
  privacy: 1,
  eula: 1,
  'waiver-adult': 1,
  'waiver-minor': 1,
} as const;
```

This is a TypeScript constant — not DB-driven — so a version bump always ships with the new document content in the same commit.

### Social media consent

Treated as its own consent stream with the same record shape, but `key: 'social-media'`. No on-disk document; the prompt text lives in i18n. Versioned for the same reason: if we change the wording (e.g. add "Instagram Stories"), we want to know who consented to which wording.

### Health intake — Vaš životni ritam

A separate intake step modelled on the paper form Baza already uses. Six questions, asked once at onboarding for every client (including minors — guardian answers on behalf):

| # | Question (sr) | Type | Conditional |
|---|---|---|---|
| 1 | Da li ste fizički aktivni? | Da / Ne | — |
| 2 | Da li vam je ovo prvi trening pilatesa? | Da / Ne | — |
| 3 | Da li imate neke tegobe? | Da / Ne | If Da → required free-text "Opišite ukratko" |
| 4 | Da li imate neke povrede? | Da / Ne | If Da → required free-text |
| 5 | Da li ste trudni? | Da / Ne | — (asked of all clients regardless of perceived gender, matches the paper form) |
| 6 | Da li ste u postporođajnom periodu? | Da / Ne | — |

**Legal basis:** Health information is special-category personal data under Article 17 ZZPL. The screen must show, above the questions:
> *"Ovi podaci se koriste isključivo da prilagodimo trening Vašem stanju. Davanje odgovora je dobrovoljno; ako odlučite da ih ne podelite, prihvatate da trening ne možemo posebno prilagoditi. Podatke možete obrisati u svakom trenutku iz svog profila."*

The user must affirmatively check *"Saglasan/saglasna sam da Studio obrađuje ove zdravstvene podatke u svrhu prilagođavanja treninga"* before answers are saved. Refusing this is allowed — they continue, but no health record is created (trainer sees "intake skipped" instead of blank answers, which is semantically different).

**One-time vs. ongoing:** Question 2 (first pilates session ever) is a snapshot at onboarding; never re-asked. Questions 3–6 are also captured at onboarding, but the user can update them anytime from profile (e.g. pregnancy starts later). Each update writes a new versioned `ClientHealthIntake` record; old records are kept for audit but only the most recent is shown to trainers.

**Flagging for trainers:** A `Da` on questions 3, 4, 5, or 6 sets a corresponding boolean on the client's flag bundle that's visible on the trainer's session-view client card and the admin's client profile. Specifically:
- `hasComplaints` (tegobe) — trainer sees the free-text on session card.
- `hasInjuries` (povrede) — same.
- `isPregnant` — bold visible badge on every client card and session view.
- `isPostpartum` — same.

These are not booking gates. They're warnings so the instructor adjusts the session.

**Withdrawal:** From profile, the client can revoke health-data consent. This hard-deletes the `ClientHealthIntake` rows (not just hides them) and writes an audit row `HealthIntakeWithdrawal { userId, withdrawnAt }`. Trainer card shows "Pacijent je povukao saglasnost za zdravstvene podatke."

---

## Data model

New Prisma models (additive — no changes to existing tables):

```prisma
enum ConsentDocumentKey {
  tos
  privacy
  eula
  waiver_adult
  waiver_minor
  social_media
}

model ConsentRecord {
  id           String              @id @default(uuid())
  userId       String
  user         User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  documentKey  ConsentDocumentKey
  version      Int
  locale       AppLocale
  accepted     Boolean             // true = Da, false = Ne (only meaningful for social_media)
  acceptedAt   DateTime            @default(now())
  ipAddress    String?
  userAgent    String?
  appVersion   String?
  // Guardian fields populated only when the consenting user is a minor at acceptedAt
  guardianName         String?
  guardianRelation     String?      // free-text but UI is sr-locale picker: roditelj | staratelj
  guardianVerifiedAt   DateTime?    // set by admin when paper signature collected
  guardianVerifiedById String?
  guardianVerifiedBy   User?        @relation("GuardianVerifier", fields: [guardianVerifiedById], references: [id])

  @@index([userId, documentKey, version])
  @@index([userId, acceptedAt])
}
```

**Invariants:**
- Records are append-only. Updating a consent (e.g. revoking social media) writes a *new* row with `accepted: false`; never UPDATE/DELETE.
- Latest accepted version for `(userId, documentKey)` is the max `acceptedAt` row with `accepted: true`.
- For minors at `acceptedAt`, `guardianName` and `guardianRelation` are required (validated by Zod at API boundary).

### Health intake schema

Separate from `ConsentRecord` because retention, access controls, and deletion behaviour differ.

```prisma
model ClientHealthIntake {
  id              String   @id @default(uuid())
  clientProfileId String
  clientProfile   ClientProfile @relation(fields: [clientProfileId], references: [id], onDelete: Cascade)
  isPhysicallyActive Boolean
  isFirstPilates     Boolean
  hasComplaints      Boolean
  complaintsDetails  String?    // required when hasComplaints = true
  hasInjuries        Boolean
  injuriesDetails    String?    // required when hasInjuries = true
  isPregnant         Boolean
  isPostpartum       Boolean
  recordedAt         DateTime   @default(now())
  recordedByUserId   String?    // null if self-recorded, set when a trainer/admin records on behalf
  recordedBy         User?      @relation("HealthIntakeRecordedBy", fields: [recordedByUserId], references: [id])
  // Guardian context if recorded for a minor
  guardianName     String?
  guardianRelation String?

  @@index([clientProfileId, recordedAt])
}

model HealthIntakeWithdrawal {
  id              String   @id @default(uuid())
  clientProfileId String
  clientProfile   ClientProfile @relation(fields: [clientProfileId], references: [id], onDelete: Cascade)
  withdrawnAt     DateTime @default(now())
}
```

**Invariants:**
- Multiple intake records are allowed per client (append on update). Trainer-visible version is the newest.
- On withdrawal: all `ClientHealthIntake` rows for the client are **hard-deleted** (this is health data, "right to erasure" applies meaningfully); a `HealthIntakeWithdrawal` audit row records that the deletion happened.
- Zod validation at the API layer enforces `complaintsDetails` / `injuriesDetails` are non-empty when the corresponding boolean is true.
- Retention: tied to account lifetime, **not** the 5-year consent metadata retention. Hard-delete on account closure.

### Consent stream for health intake

A separate `ConsentRecord` with `documentKey: health_intake` records the *consent to process health data* (the "Saglasan sam da Studio obrađuje..." checkbox). This is what proves we had legal basis under Art. 17 ZZPL. The `ClientHealthIntake` row is the actual data; the `ConsentRecord` is the pristanak that authorised collecting it. They live in parallel: revoking the consent triggers the hard-delete + audit row described above.

Add `health_intake` to the `ConsentDocumentKey` enum.

### Helper: `getConsentStatus(userId)`

Returns:
```ts
type ConsentStatus = {
  pending: Array<{ key: ConsentDocumentKey, currentVersion: number, reason: 'missing' | 'outdated' }>;
  socialMediaDecided: boolean;
  guardianVerificationNeeded: boolean; // minor whose paper signature isn't collected
};
```

Used by:
- Middleware: if `pending.length > 0` or (`client` && `!socialMediaDecided`), redirect to `/consent`.
- Profile screen: render the table.
- Booking handler: if `guardianVerificationNeeded` AND the client has already attended ≥1 session, block new bookings with a specific error.

### `app/(client)/profile` gates

The "guardian needs paper signature" block on profile shows up after the *first* completed session (we don't pester them before they've shown up once) and stays until admin toggles `guardianVerifiedAt`.

---

## Routing & middleware

`apps/mobile/app/+middleware.ts` already exists. Add a check:

```ts
// pseudocode
if (request.user && !isPublicRoute(pathname)) {
  const status = await getConsentStatus(request.user.id);
  const needsGate = status.pending.length > 0 || (request.user.role === 'CLIENT' && !status.socialMediaDecided);
  if (needsGate && pathname !== '/consent') {
    return redirect('/consent');
  }
}
```

`/consent` is itself a public-when-authenticated route (auth required, but no consent required to view it).

The sign-in screen's bottom legal strip becomes tappable: each of "Uslovi", "Privatnost", "EULA" links to a public read-only viewer at `/legal/[key]` so visitors can read before signing up.

---

## Screens (new)

### `app/consent.tsx`
Scrollable single-page consent flow:
- Header: "Dobrodošli u Baza" (first time) or "Ažurirali smo naše dokumente" (re-consent).
- For each pending document: card with title, "Šta se promenilo" (if re-consent), "Pročitaj ceo dokument" link → opens sheet with full text, checkbox "Pročitao/la sam i prihvatam".
- For client minor: guardian block (name input, relationship picker, "Potvrđujem da sam roditelj/staratelj…" checkbox, notice about paper signature).
- For client: social media question with Da/Ne radio.
- Footer: "Nastavi" (primary, disabled until valid), "Odjavi se" (link).

### `app/legal/[key].tsx`
Public read-only viewer. Renders the active version's markdown. Used from sign-in strip and from profile.

### `app/(client)/profile` — new "Pravna dokumenta" section
Section component, not a new screen.

### `app/(admin)/pregled/klijenti/[id]` — new "Pravna dokumenta" panel
List of consent records, guardianVerified toggle for minors.

### `app/(admin)/klijenti` invite form
Add `defaultLocale` field to the invite creation form.

---

## API additions

```
GET    /api/legal/documents              → list active versions per key+locale (for app boot)
GET    /api/legal/documents/:key         → full markdown for the active version
GET    /api/consent/status               → ConsentStatus for current user
POST   /api/consent/accept               → body: { documentKey, version, accepted, guardian? } → ConsentRecord
POST   /api/consent/social-media         → body: { accepted: boolean } → ConsentRecord (key=social_media)
POST   /api/consent/refuse               → triggers sign-out + admin notification
POST   /api/admin/clients/:id/guardian-verified → admin only, sets guardianVerifiedAt on minor's waiver record
GET    /api/health-intake                → most recent ClientHealthIntake for current client (or 404)
POST   /api/health-intake                → upsert (writes new row) — includes health-intake ConsentRecord
DELETE /api/health-intake                → withdraw consent: hard-delete intake rows + write withdrawal audit
```

All POST endpoints record `ipAddress`, `userAgent`, and `appVersion` server-side from the request — never trust client-supplied values.

---

## i18n keys (new)

All keys added to both `sr.json` and `en.json`:

```
consent.welcomeTitle, consent.welcomeSubtitle,
consent.updateTitle, consent.updateSubtitle,
consent.readFullDocument, consent.iAccept,
consent.guardianBlockTitle, consent.guardianNameLabel,
consent.guardianRelationLabel, consent.guardianRelationParent,
consent.guardianRelationLegal, consent.guardianConfirm,
consent.guardianPaperNotice,
consent.socialMediaQuestion, consent.socialMediaYes, consent.socialMediaNo,
consent.continue, consent.signOut,
consent.changesSummaryLabel,
consent.localeToggle,
intake.title, intake.notice, intake.consentCheckbox,
intake.q.physicallyActive, intake.q.firstPilates,
intake.q.complaints, intake.q.complaintsDetailsLabel, intake.q.complaintsDetailsPlaceholder,
intake.q.injuries, intake.q.injuriesDetailsLabel, intake.q.injuriesDetailsPlaceholder,
intake.q.pregnant, intake.q.postpartum,
intake.skipOption, intake.skipConfirmation,
profile.legalSection, profile.legalAccepted, profile.legalUpdateNeeded,
profile.socialMediaToggle,
profile.healthIntakeSection, profile.healthIntakeEdit, profile.healthIntakeWithdraw,
profile.healthIntakeWithdrawConfirm,
auth.languageToggle,
admin.client.legalPanel, admin.client.guardianVerifiedToggle,
admin.client.healthFlags.pregnant, admin.client.healthFlags.postpartum,
admin.client.healthFlags.complaints, admin.client.healthFlags.injuries,
admin.client.healthFlags.withdrawn,
notif.consentRefused.title, notif.consentRefused.body,
notif.minorPaperNeeded.title, notif.minorPaperNeeded.body
```

---

## DOB dependency

This spec assumes the parallel session is adding `dateOfBirth` (full date) to `ClientProfile` and surfacing it via `authQueries.me()`. We need at minimum:

```prisma
model ClientProfile {
  // ...existing...
  dateOfBirth DateTime  // non-nullable; required at invite-accept and stored at that point
}
```

Because no users exist yet (decision §2), DOB can be a required field from day one — no backfill, no adult-default fallback. If a user somehow reaches `/consent` without a DOB on file, treat it as a data-integrity error (500 + admin alert), not a silent fallback.

Minor detection: `differenceInYears(now(), clientProfile.dateOfBirth) < 18` at the moment the consent is recorded. Stored on the `ConsentRecord` and `ClientHealthIntake` rows so subsequent age-up doesn't retroactively invalidate the guardian flow.

---

## Testing strategy

### Unit
- `getConsentStatus()` — happy path, outdated version, missing record, mixed states, social-media never decided.
- Minor detection from DOB at boundary (turning 18 today / tomorrow).
- Version comparison: future-proof against missing version in DB.

### Integration
- `POST /api/consent/accept` records ip + ua + appVersion server-side and ignores client values.
- `POST /api/consent/refuse` signs user out, creates admin notification.
- Version bump → next `GET /api/consent/status` returns the bumped doc as `outdated`.
- Minor flow: guardian fields required at API; admin verification endpoint flips the flag.
- Booking blocked after first session if `guardianVerificationNeeded`.
- `POST /api/health-intake` requires details when `hasComplaints` or `hasInjuries` is true; rejects with 400 otherwise.
- `POST /api/health-intake` writes a parallel `ConsentRecord(key=health_intake)` in the same transaction.
- `DELETE /api/health-intake` hard-deletes all rows for the client and writes a `HealthIntakeWithdrawal` row in the same transaction.
- Trainer GET endpoints surface the four health flags (pregnant/postpartum/complaints/injuries) on client cards.

### E2E (Playwright)
- First-time client login → routed to /consent → accepts legal → fills intake → answers social → routed to (client) home.
- First-time minor login → guardian block shown on Izjava → guardian fills intake on behalf → routed in but with profile warning visible after seeding a completed session.
- Version-bump scenario: seed accepted v1, bump active to v2, next login shows only the bumped doc.
- Refusal path: tap "Odjavi se" on legal section → signed out → admin sees notification.
- Refusal of health-intake consent (unchecks the "Saglasan sam..." box) → user continues, trainer view shows "intake skipped" not "blank answers."
- Withdrawal from profile → intake rows gone, `HealthIntakeWithdrawal` row exists, trainer card reflects withdrawal.
- Language toggle on /consent header switches docs between sr and en without losing in-progress acceptance state.
- Sign-in legal strip links → public viewer renders markdown without auth.

---

## Notifications integration

The existing notifications stack (`NotificationLog` model, `NotificationType` enum, `app/api/notifications/`, push-token pipeline) covers most of what we need. Two new `NotificationType` enum values are added:

- `CONSENT_REFUSED` — fired when a user declines a gate document and signs out. Routed to all `ADMIN`-role users.
- `MINOR_PAPER_NEEDED` — fired when a minor completes their first session and `guardianVerifiedAt` is still null. Routed to all `ADMIN`-role users.

### Admin notifications sheet (prerequisite)

Admins currently have **no in-app surface** for `NotificationLog` rows targeted at them. The `(admin)` tab bar already has 5 tabs (pregled, katalog, klijenti, naplata, izvestaji) — adding a sixth is past the comfort line. Instead:

- Add a **bell icon** to the existing `AppHeader` on admin screens (next to the avatar that opens `ProfileSheet`).
- The bell shows an unread-count dot driven by `notificationsQueries.list()` filtered to the logged-in admin.
- Tapping the bell opens an `AppSheet` containing the inbox — same structure and components as `(client)/notifications.tsx`, but extracted into a shared `NotificationsInbox` component so both sides render from one source.
- Mount the sheet via a `NotificationsSheetProvider` at the root of `(admin)/_layout.tsx`, mirroring the `ProfileSheetProvider` pattern in `components/ui/profile-sheet.tsx`.
- No tab consumed, no new route. Unread state visible from any admin screen via the header bell.
- API: existing `GET /api/notifications` already returns the caller's notifications. No changes; admin gets their own list because the endpoint filters by authenticated `userId`.

This ships as **Step 0** of the rollout plan, before any consent-gate work. It's a small, independently-useful PR (the admin bell would carry booking-cancellation and other admin-targeted notifications going forward, not just consent alerts).

#### Refactor: shared `NotificationsInbox` component

To avoid duplicating ~300 lines of inbox UI between `(client)/notifications.tsx` and the new admin sheet, extract the inbox into `components/notifications/notifications-inbox.tsx`:

- Props: `{ context: 'client' | 'admin' }` if any role-specific labels/icons differ; otherwise none — both sides render the same list.
- The client `notifications.tsx` becomes a thin wrapper that renders `<NotificationsInbox />` inside a screen + header.
- The admin sheet renders `<NotificationsInbox />` inside an `AppSheet`.

Push-token behaviour is unchanged — admins who registered a push token already receive push for any `NotificationLog` row targeted at their userId.

## Rollout plan

0. **(Prerequisite, separate PR)** Extract `NotificationsInbox` shared component. Add bell icon + `NotificationsSheetProvider` to admin `AppHeader` + `(admin)/_layout.tsx`. No new API. Ship and verify before Step 1.
1. Land schema migration (`ConsentRecord`, `ClientHealthIntake`, `HealthIntakeWithdrawal`, two new `NotificationType` values) + API endpoints + helper, no UI yet. Backfill: nothing (no users exist).
2. Land documents (sr + en, v1) under `docs/legal/`.
3. Land `/consent` screen + middleware redirect. Feature-flag the middleware enforcement with `BAZA_CONSENT_GATE_ENABLED` env so we can deploy and verify before turning the gate on.
4. Land `ProfileSheet` sections ("Pravna dokumenta", "Zdravstveni podaci") + admin client-detail legal/health panels + auth-screen language toggle.
5. Internal QA with seeded test users (adult, minor, withdrawal flow, language switching).
6. Flip the env flag on production.
7. No client-comms needed at first launch (no users exist yet); add to onboarding emails once users start being invited.

---

## Resolved decisions

1. **Document language** → every account defaults to `sr` (Serbian) and `preferredLocale` is applied app-wide. Language toggle added to auth screens (sign-in / accept-invite / reset-password) and to the consent screen header. Admin invite no longer collects locale. (Confirmed 2026-05-14.)
2. **Existing users** → no users exist yet. Adult-default fallback removed from the spec as unnecessary. Every client onboarded after launch will have a DOB at invite time. (Confirmed 2026-05-14.)
3. **Guardian verification** → digital flow + paper at first visit. Email-verification upgrade is left as a future enhancement, not in scope. (Confirmed 2026-05-14.)
4. **Document maintenance** → undecided. Default: source-controlled, edited in PRs. Revisit when first lawyer-driven update happens.
5. **Client-facing legal / health UI** → lives inside the existing `ProfileSheet`, not on a new tab or screen. (Confirmed 2026-05-14.)
6. **Admin notifications surface** → bell icon + sheet from `AppHeader`, not a sixth tab. Shipped as a Step 0 prerequisite PR, with the inbox component shared between client and admin. (Confirmed 2026-05-14.)

---

## Risks & mitigations

- **Risk:** Legal text changes frequently in first months. *Mitigation:* version bump is one constant + one new file; PR-friendly.
- **Risk:** Existing user base hit with consent gate causes drop-off. *Mitigation:* admin email warning + designed-for-quick-completion UI (single scroll, one tap per doc).
- **Risk:** Minor signs as themselves and lies. *Mitigation:* paper-signature-on-first-visit catches it, booking-block after first session enforces it. Discussed in advance with user 2026-05-14.
- **Risk:** Storing IP without VPN-awareness misleads about identity. *Mitigation:* IP is evidentiary metadata only, paired with ua + appVersion + authenticated session. Discussed in advance with user 2026-05-14.
- **Risk:** Legal text quality — Claude-drafted, not lawyer-reviewed. *Mitigation:* all drafted docs include a top-of-file `[LEGAL REVIEW]` banner. User commits to a lawyer review pass before production rollout.
