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

## Deferred

- Online payments and all misc innovation features are intentionally out of MVP.
