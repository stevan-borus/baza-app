# Baza App MVP Scope

## Roles

- **Admin**: invite-only client onboarding, client management, training/schedule/package/billing management, advanced reports, package pause.
- **Trainer**: own calendar, own-session client list, check-in, session notes.
- **Client**: login, package status, booking/cancel, waitlist, notifications, password reset.

## Auth

- Public registration is disabled.
- Admin creates invite with email.
- Client activates account through one-time invite token and sets password.
- Client can request password reset later using one-time reset token email.

## Core UX

- Role-specific calendar flows:
  - Admin/trainer: operational calendar for assignment and management.
  - Client: monthly availability + booking flow.
- QR-based check-in flow for in-studio attendance processing.

## Current phase additions (post-MVP, in scope now)

Three features promoted out of "deferred" — full design in `CONTEXT.md`:

- **Campaign** — admin-composed, audience-targeted messages (six combinable axes), delivered in-app + push + email, with `campaignsEnabled` opt-out + tokenized email unsubscribe, persisted with a sent-history view, and a DRAFT/SCHEDULED/SENT lifecycle (scheduled sends via a 30-min polling cron, no queue infra). Gated on a verified Resend domain + a marketing-consent privacy clause (see runbook + `docs/legal/MARKETING-CONSENT-TODO.md`).
- **Moji paketi** — client-facing packages-&-payments timeline (paid rows + comp rows labeled; COMPANY method softened to "Plaćeno").
- **Booking-change email** — transactional email for the four "happened to the client, not by them" events (waitlist promotion, admin cancel, bulk cancel as one summary, session updated), localized, with a `bookingEmailsEnabled` courtesy opt-out that suppresses only the email channel.

## Deferred

- Online payments and all misc innovation features are intentionally out of MVP.
- Fully auto-sent (no-admin) marketing nudges; campaign open/click analytics; per-event granular email toggles; admin-authored bilingual campaign bodies.
