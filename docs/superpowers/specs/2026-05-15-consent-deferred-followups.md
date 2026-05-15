# Consent Gate — Deferred Follow-ups

**Date:** 2026-05-15
**Status:** Open — pulled out of PR #32 scope so the branch can ship
**Parent spec:** `2026-05-14-client-legal-consent-design.md`

This is a running list of items the original consent-gate design covered (or
that surfaced during smoke-testing) that are deliberately deferred. The
gate, profile sections, admin panels, booking gate, and session-detail
flags are all in PR #32. The items below are not.

Each item lists what it is, why it was deferred, and a rough rebuild
sketch so a future you (or another agent) can pick it up cheaply.

---

## 1. Re-consent "what changed" diff per document

**Status:** Partially built — the `/consent` screen detects re-consent
(`pending.some((p) => p.reason === "outdated")`) and renders a different
header (`consent.updateTitle` / `consent.updateSubtitle`). What's missing
is a **per-document "Šta se promenilo" summary** the spec called for.

**Why deferred:** No documents have actually been versioned yet, so we
have no real summaries to display. Adding a UI slot for empty diffs
risks designing in a vacuum.

**Sketch:** Add an optional `changeSummary` field per doc in
`docs/legal/{sr,en}/<key>-vN.md` frontmatter (or a sibling
`<key>-vN.changes.md`). Surface it on the `DocumentCard` when
`p.reason === "outdated"`. Bump a version → first real summary forces
the UX to settle.

---

## 2. Markdown rendering of "Šta se promenilo"

Tied to #1. Currently the gate just shows generic re-consent copy. If a
diff is provided per doc, render it as a collapsed disclosure (`<details>`-style)
on the doc row, expandable to show the markdown.

---

## 3. Guardian email-verification upgrade

**Status:** Out of scope per spec §"Resolved decisions #3" (2026-05-14).

The current minor flow is: client signs in, fills guardian name +
relation, submits. The studio collects a paper signature at first
visit. An admin then flips `guardianVerifiedAt`.

**Future:** Add an email-token verification step so the guardian
actively confirms by clicking a link. Schema lift: a
`GuardianVerificationToken { id, consentRecordId, tokenHash,
expiresAt }` table. Sends via existing email pipeline. Doesn't replace
the paper signature — adds a digital trail.

**Why deferred:** Studio is small, paper works, no compliance pressure
to upgrade yet. Revisit when the lawyer review pass flags this.

---

## 4. Health-intake audit history UI

**Status:** Data is stored — every `ClientHealthIntake` write is a new
row by design — but there is no admin UI to *view* the history. Admin
sees only the latest via `ClientHealthPanel`.

**Why deferred:** Hardly anyone has more than one intake row yet. Once
a real client updates their intake (e.g. pregnancy state changes),
admins may want to see the sequence.

**Sketch:** Add a "History" disclosure on `ClientHealthPanel` that
loads `GET /api/admin/clients/:id/health/history` and renders prior
intakes by `recordedAt desc`. Cheap.

---

## 5. Symmetric `ConsentRecord(health_intake, accepted: false)` on withdrawal

**Status:** Inconsistency with the social-media pattern.

Currently when a user revokes health-data consent via profile:
- `ClientHealthIntake` rows are hard-deleted (correct — Art. 17).
- `HealthIntakeWithdrawal` audit row is written (correct).
- **No** `ConsentRecord(documentKey: health_intake, accepted: false)`
  row is written.

For social-media, every flip (Da → Ne or vice versa) writes a new
`ConsentRecord` row, so the consent ledger reflects the change. Health-
intake's consent withdrawal is recorded only in
`HealthIntakeWithdrawal`, which lives outside the unified consent
ledger.

**Why deferred:** The spec didn't explicitly require it. Both forms
satisfy the audit requirement; the inconsistency is cosmetic but
might confuse a future auditor trying to query "every consent flip
this user ever made" by reading `ConsentRecord` alone.

**Sketch:** In `withdrawIntake()` (`lib/server/health-intake.ts`), also
write a `ConsentRecord({ documentKey: "health_intake", accepted:
false, locale, evidence, ... })` in the same transaction. Costs one
extra INSERT.

---

## 6. Onboarding email mentioning the consent gate

**Status:** Future, per spec §"Rollout plan #7".

The first time real clients are invited, the invite email should
warn that they'll need to accept legal docs + answer the
social-media question on first sign-in. Avoids surprise.

**Why deferred:** Studio has no real users yet — first invite goes out
after PR #32 ships. Easier to write copy from the perspective of "we
have the gate" than "we're about to add a gate."

**Sketch:** Edit the invite-email template at
`apps/mobile/lib/server/email-templates.ts` (or wherever Resend
templates live). One paragraph above the "Accept invite" CTA.

---

## 7. Studio Da/Ne UX for legacy users without a social-media row

**Status:** Code handles the case (`socialMediaAccepted: boolean | null`
on the booking row; UI shows "Nije pitano" / "Not asked") but legacy
users haven't been forced through the gate yet, so the UI path is
unreached in practice.

**Why deferred:** No legacy users in production. Once they go
through the consent gate, they'll all have a row and "Nije pitano"
becomes vestigial.

**Sketch:** When the gate has been live for a full month with all
active users having flowed through, prune the "null" branch from
session-detail / client-detail rendering.

---

## 8. "Intake skipped" distinct rendering on trainer card

**Status:** Currently the booking row in session-detail collapses
"intake skipped" and "intake recorded with no flags" into the same
visual (no badges, no warning banner). The spec called these out as
semantically different: a trainer reading "no flags" should know
whether the client said "no to all" or refused to share at all.

The booking-row data shape already exposes
`consentFlags.intakeRecorded`, so the distinction is one branch away.

**Sketch:** When `!intakeRecorded && !intakeWithdrawn`, render a quiet
"Klijent nije podelio zdravstvene podatke" line instead of nothing.

---

## 9. Withdrawal copy for booked-session card vs. profile

Currently the session-detail "withdrawn" copy reads
"Klijent je povukao saglasnost za zdravstvene podatke." That's
adequate but a bit generic.

The spec called for "Pacijent je povukao saglasnost za zdravstvene
podatke." (using "pacijent" — patient — instead of "klijent"). Pick
one. Studio uses "klijent" everywhere else so we kept that.

**Action:** Lawyer-review pass should pick the preferred term for legal
copy. Update i18n key `admin.sessionDetail.healthWithdrawn` once
decided.

---

## 10. Lawyer review of all legal documents

**Status:** Marked `[LEGAL REVIEW]` in every doc body. **Hard gate**
before flipping `BAZA_CONSENT_GATE_ENABLED=true` in prod.

Docs:
- `docs/legal/sr/tos-v1.md`
- `docs/legal/en/tos-v1.md`
- `docs/legal/sr/privacy-v1.md`
- `docs/legal/en/privacy-v1.md`
- `docs/legal/sr/waiver-adult-v1.md`
- `docs/legal/en/waiver-adult-v1.md`
- `docs/legal/sr/waiver-minor-v1.md`
- `docs/legal/en/waiver-minor-v1.md`
- `docs/legal/sr/health-intake-v1.md`
- `docs/legal/en/health-intake-v1.md`

After lawyer pass, strip `[LEGAL REVIEW]` markers and bump to v2 in
`ACTIVE_VERSIONS`. The bump triggers re-consent on next sign-in for
anyone who accepted v1.

---

## 11. Manual browser/iOS QA across locales + minor flow

**Status:** Code paths tested via Playwright + integration. Real
end-to-end touch testing on actual devices (not just simulator) hasn't
happened. Required before flipping the prod env flag.

---

## 12. Re-tighten `getConsentStatus` once invite DOB is enforced everywhere

We already tightened `inviteClientInputSchema.dateOfBirth` to required.
The `getConsentStatus` helper still throws on missing DOB — that's the
right behavior. But there's a possible edge case: admin could null out
a DOB via the update endpoint (`updateClientInputSchema.dateOfBirth:
dateOfBirthSchema.nullable().optional()`). That would break the gate
for that client.

**Sketch:** Make the admin update endpoint refuse `dateOfBirth: null`
for CLIENT-role users. Or remove `.nullable()` from
`updateClientInputSchema` entirely.

**Why deferred:** No admin is actively doing this. Worth a one-line
schema tighten in a separate PR.

---

## How to pick one of these up

Each item above is sized to be a single small PR. Sketch in this file
is the starting point; refine into a focused spec if the work is
larger than ~one day.

If you pick one up:
1. Mention which item in the PR title (e.g. "Item #5 — symmetric
   health_intake withdrawal ConsentRecord").
2. Remove from this list when shipped.
3. If you discover new deferred items, add them here so the next round
   has a starting point.
