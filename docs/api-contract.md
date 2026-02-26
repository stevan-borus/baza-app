# API Contract (Phase 2 MVP)

Session cookies are HttpOnly and managed by Better Auth (`/api/auth/*`).

## Auth

- `POST /api/auth/sign-in` - role: public - request: `{ email, password }` - response: session cookie + user
- `POST /api/auth/sign-out` - role: authenticated - request: none - response: clear session cookie
- `GET /api/auth/me` - role: authenticated - request: none - response: `{ user }`
- `POST /api/auth/complete-invite` - role: public via invite token - request: `{ token, password }` - response: created user + session cookie
- `POST /api/auth/request-password-reset` - role: public - request: `{ email }` - response: `{ success }`
- `POST /api/auth/reset-password` - role: public via reset token - request: `{ token, password }` - response: `{ success }`
- `GET/POST /api/auth/[...all]` - Better Auth native endpoints (session, sign-in/email, sign-out, etc.)

## Clients

- `GET /api/clients` - role: `ADMIN | TRAINER` - response: client list with profile data
- `POST /api/clients` - role: `ADMIN` - request: invite-like user payload - response: created client user/profile
- `PATCH /api/clients/:id` - role: `ADMIN | TRAINER` - request: editable client fields - response: updated user/profile

## Schedule

- `GET /api/sessions` - role: `ADMIN | TRAINER` - response: operational session list
- `POST /api/sessions` - role: `ADMIN | TRAINER` - request: create session payload - response: created session
- `PATCH /api/sessions/:id` - role: `ADMIN | TRAINER` - request: partial session updates (schedule/status/assignment)
- `POST /api/sessions/recurring` - role: `ADMIN | TRAINER` - request: recurring session template payload - response: created batch
- `GET /api/sessions/availability?month=YYYY-MM` - role: `ADMIN | TRAINER | CLIENT` - response: monthly session availability
- `POST /api/bookings` - role: `CLIENT` - request: `{ sessionId, action: "BOOK" | "CANCEL" }` - response: booking state
- `GET /api/rooms` - role: `ADMIN | TRAINER` - response: studio rooms
- `POST /api/rooms` - role: `ADMIN` - request: room payload - response: created room
- `GET /api/trainings/class-types` - role: `ADMIN | TRAINER` - response: class types
- `POST /api/trainings/class-types` - role: `ADMIN` - request: class type payload - response: created class type

## Packages

- `GET /api/packages/types` - role: authenticated - response: package type catalog
- `POST /api/packages/types` - role: `ADMIN` - request: package type payload - response: created package type
- `GET /api/packages/client-packages` - role: `ADMIN | TRAINER | CLIENT` - response: client package history/active package
- `POST /api/packages/client-packages` - role: `ADMIN | TRAINER` - request: `{ clientProfileId, packageTypeId, startsAt }` - response: created client package
- `POST /api/packages/pause` - role: `ADMIN | TRAINER` - request: pause range for client package validity freeze

## Billing and Reports

- `GET /api/billing?cursor&take` - role: `ADMIN` - response: paginated billing records
- `POST /api/billing` - role: `ADMIN` - request: billing payload (optional package activation) - response: created record
- `GET /api/reports/summary` - role: `ADMIN | TRAINER` - response: summary KPI object
- `GET /api/reports/attendance?from&to&period=day|week|month` - role: `ADMIN | TRAINER` - response: attendance by period
- `GET /api/reports/utilization?from&to&period=day|week|month` - role: `ADMIN | TRAINER` - response: booked/capacity utilization by period
- `GET /api/reports/revenue?from&to&period=day|week|month&includeDeltas=true|false` - role: `ADMIN | TRAINER` - response: revenue totals, grouped series, optional trend deltas

## Notifications

- `GET /api/notifications?cursor&take` - role: authenticated - response: paginated persisted notification list for current user
- `POST /api/notifications` - role: `ADMIN | TRAINER` - request: `{ userId, type, title, body, payload? }` - response: persisted notification and push dispatch status
- `POST /api/notifications/promotions` - role: `ADMIN` - request: promotion payload - response: dispatched to marketing-opted users
- `POST /api/notifications/push-token` - role: authenticated - request: `{ deviceId, expoPushToken }` - response: registered/updated Expo token
- `GET /api/notifications/preferences` - role: authenticated - response: current notification preferences
- `PATCH /api/notifications/preferences` - role: authenticated - request: `{ pushEnabled?, inAppEnabled?, marketingOptIn? }` - response: updated preferences
- `PATCH /api/notifications/:id` - role: authenticated - response: mark notification as read

## Trainer Notes

- `GET /api/trainer-notes?sessionId&clientProfileId&cursor&take` - role: `ADMIN | TRAINER | CLIENT` - response: paginated trainer notes list (client sees own notes)
- `POST /api/trainer-notes` - role: `ADMIN | TRAINER` - request: `{ sessionId, clientProfileId, note }` - response: created trainer note

## Invite Operations

- `POST /api/invites` - role: `ADMIN` - request: invite payload - response: invite metadata
- `POST /api/invites/:id/resend` - role: `ADMIN` - response: `{ success }`
- `POST /api/invites/:id/revoke` - role: `ADMIN` - response: `{ success }`

## Misc

- `GET /api/health` - role: public - response: API liveliness payload

## Cron (Server-to-server)

- `POST /api/cron/notifications/reminders` - header `x-cron-token` required - sends T-24h reminders to booked clients
- `POST /api/cron/notifications/package-expiry` - header `x-cron-token` required - sends package-expiry reminders
