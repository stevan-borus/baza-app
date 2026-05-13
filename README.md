# BAZA Pilates Studio

A booking and operations app for a single Pilates studio. Built around the
way one studio actually runs: the studio operator (Admin) sells session
packages to members (Clients), members book classes against those packages,
and the trainers running the classes keep private notes per client.

Three roles, one app:

- **Admin** — the studio operator. Manages the class catalog, room
  inventory, trainer roster, package types, schedule, payments, and
  clients. Sees everything.
- **Trainer** — a coach who runs sessions. Sees only their own upcoming
  and past sessions, and only the clients they've actually trained.
  Can write private notes per client per session.
- **Client** — a studio member. Buys packages, books classes, sees their
  remaining sessions and history, gets reminders before each session.

## What it does

- **Schedule**: one-off sessions and recurring series (Mon/Wed/Fri × N
  weeks). Conflict detection for double-booked rooms and trainers.
  Editable per occurrence or across the whole series.
- **Packages**: SKUs ("Reformer 12-pack / 30 days") scoped to a single
  class type — a Reformer 12-pack can't be used to book Energy.
  Snapshot purchase-time pricing and late-cancel rules so future SKU
  edits don't retroactively change in-flight packages.
- **Bookings**: clients book sessions against their eligible packages.
  Late cancellations forfeit the session; early cancellations don't.
  Full sessions get a waitlist that auto-promotes on cancellation.
- **Billing**: admin records a payment → a package and a billing record
  are created atomically. Comp packages (no payment) supported.
- **Reports**: revenue, utilization (per room / class type / trainer /
  time-of-day heatmap), bookings (show rate, cancellation breakdown),
  packages (most sold, paid vs. comp). Period pill toggles between
  current month / quarter / year / all time.
- **Notifications**: session reminders, package-expiry warnings, waitlist
  promotions. Email via Resend, push via Expo notifications.

## Status

In active development for the first studio (Novi Sad). Not yet open for
other studios.

## License & trademarks

Source-available under the [Business Source License 1.1](./LICENSE).
Production use is reserved until the Change Date (2030-05-13), after
which the code converts to Apache License 2.0. You may read, fork,
build, and study the source; you may not use it to operate a pilates
studio, fitness studio, or any other commercial service before the
Change Date.

"BAZA", "BAZA Pilates Studio", and the BAZA logo are trademarks of
DANICA PIPER PR PILATES STUDIO BAZA NOVI SAD — see [TRADEMARKS.md](./TRADEMARKS.md).

Licensing questions, partnership inquiries, or trademark permissions:
**bazapilates@gmail.com**

## Tech

Expo (mobile + web + server API routes) on a Turborepo monorepo with pnpm
workspaces. Mobile is React Native + Tamagui + Expo Router + TanStack Query;
server is Expo API routes with Prisma + Postgres + Better Auth; emails via
Resend; deployment via EAS Hosting and EAS Build.

Setup, conventions, deployment, and operations live alongside the code:

- [`CONTEXT.md`](./CONTEXT.md) — domain language and relationships
- [`AGENTS.md`](./AGENTS.md) — contributor / tooling conventions
- [`docs/`](./docs/) — API contract, calendar spec, reports spec,
  cron-ops, deployment runbook, ADRs
