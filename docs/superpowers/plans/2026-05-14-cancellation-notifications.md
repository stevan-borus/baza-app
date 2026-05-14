# Cancellation Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify all admins and the Session's assigned Trainer whenever a Client cancels a Booking. Late cancels (per existing `shouldApplyLateCancelPenalty`) push to phone; early cancels are silent in-app only.

**Architecture:** A new `notifyCancellation(...)` helper, called from the cancel branch of `POST /api/bookings`, queries the admin user set + the session's trainer, and dispatches one `NotificationLog` row per recipient. Push vs. silent is controlled by a new `skipPush?: boolean` option added to the existing `createAndDispatchUserNotification`. Two new `NotificationType` enum values (`BOOKING_CANCELED_ADMIN`, `BOOKING_CANCELED_TRAINER`) and two new i18n message keys + sr/en copy. Reuses the existing `shouldApplyLateCancelPenalty` for the push/silent split.

**Tech Stack:** Prisma migrate (enum-additive), Vitest integration tests against real DB, `@baza/i18n` shared message dict.

**Scope decisions locked from prior grilling session:**
- Every cancellation generates a notification (no filtering on early vs. late at the *generation* layer — the gate is only "push or silent").
- Late cancels push to phone; early cancels are silent in-app (still create a `NotificationLog`, just skip Expo dispatch).
- Recipients: **all admin users** + **the session's assigned trainer** (one per session — `trainerUserId` is non-nullable on `Session`).
- Two distinct `NotificationType` enum values (one for admin recipients, one for trainer) — easier to query/filter later than a single `BOOKING_CANCELED` with a role payload.
- Notification body includes client name, class name, and session start time. Title is short and recognisable in a push.
- Waitlist auto-promotion notification (existing `SPOT_OPENED_FROM_WAITLIST` to the promoted client) is **unchanged** — orthogonal to the new admin/trainer fan-out.

---

## File Structure

**Schema:**
- Modify: `apps/mobile/prisma/schema.prisma` — add `BOOKING_CANCELED_ADMIN` and `BOOKING_CANCELED_TRAINER` to the `NotificationType` enum.
- Generate: `apps/mobile/prisma/migrations/<timestamp>_add_booking_canceled_notification_types/migration.sql`.

**Notification infrastructure:**
- Modify: `apps/mobile/lib/server/notifications.ts` — add `skipPush?: boolean` option to `NotificationPayload`; gate the Expo dispatch on `!skipPush`. Propagate from `createSystemNotification(... , options?)`.
- Modify: `packages/i18n/src/notification-messages.ts` — add `BOOKING_CANCELED_ADMIN` and `BOOKING_CANCELED_TRAINER` to the union, the `NOTIFICATION_MESSAGE_KEYS` const, and the `messages` dict with sr+en copy.

**Cancellation fan-out:**
- Create: `apps/mobile/lib/server/notify-cancellation.ts` — single export `notifyCancellation(input)` that resolves recipients (all admin users + session trainer), formats the body with client/class/time, and dispatches one notification per recipient (push for late, silent for early).
- Modify: `apps/mobile/app/api/bookings/+api.ts` — call `notifyCancellation` from the cancel branch (after the booking is marked canceled and the penalty/waitlist logic runs; before returning).

**Tests:**
- Modify: `apps/mobile/test/integration/bookings-cancel.test.ts` — add test cases covering: late-cancel pushes to admin+trainer; early-cancel records in-app for admin+trainer without push; multiple admins all get notified; trainer is the one on `Session.trainerUserId`, not someone else.

**Docs:**
- Modify: `CONTEXT.md` — append the "Cancellation notification" entry under a new `### Notifications` section. This is the same vocabulary block we drafted during the grilling session, applied here at PR-time.

No ADR needed for PR 2 — the design is a straightforward fan-out following the existing notification pattern. The interesting decisions (late vs. early push split, who gets notified) are documented in CONTEXT.md.

---

## Task 1: Verify project context

**Files:** none

- [ ] **Step 1: Confirm worktree state**

Run from `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat-cancel-notifs/`:
```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -1
git status --short
```
Expected: branch `feat/cancel-notifications`; last commit `cb73d41 feat: capture and display client date of birth (#29)` (the merged PR 1); only this plan file as untracked / no other modified files.

- [ ] **Step 2: Confirm Postgres is up and migrations applied**

```bash
pnpm --filter mobile prisma migrate status
```
Expected: `Database schema is up to date!` with 9 migrations applied (PR 1's migration is the latest).

- [ ] **Step 3: Confirm the baseline integration tests pass**

```bash
pnpm --filter mobile test:integration bookings-cancel
pnpm --filter mobile test:integration invites
pnpm --filter mobile test:integration client-dob
```
Expected: each file's tests pass green (10 + 5 + N from bookings-cancel).

If any baseline fails, report BLOCKED — we need a green starting point.

- [ ] **Step 4: Confirm the notification helper exposes the right surface**

```bash
grep -n "createAndDispatchUserNotification\|createSystemNotification\|NotificationPayload" apps/mobile/lib/server/notifications.ts | head -10
```
Expected: see `createAndDispatchUserNotification` exported, `createSystemNotification` exported, `NotificationPayload` type defined.

If the helper has been refactored since PR 1, surface the actual shape and we can adjust the plan.

---

## Task 2: Add NotificationType enum values

**Files:**
- Modify: `apps/mobile/prisma/schema.prisma`
- Create: `apps/mobile/prisma/migrations/<timestamp>_add_booking_canceled_notification_types/migration.sql`

- [ ] **Step 1: Edit the enum**

In `apps/mobile/prisma/schema.prisma`, find:
```prisma
enum NotificationType {
  BOOKING_CONFIRMED
  SESSION_UPDATED
  TRAINER_NOTE
  GENERAL
}
```
Add two new values at the end:
```prisma
enum NotificationType {
  BOOKING_CONFIRMED
  SESSION_UPDATED
  TRAINER_NOTE
  GENERAL
  BOOKING_CANCELED_ADMIN
  BOOKING_CANCELED_TRAINER
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter mobile prisma migrate dev --name add_booking_canceled_notification_types
```
Expected: creates a migration directory, applies it, regenerates the Prisma client. **Per AGENTS.md:** never `prisma db push`.

- [ ] **Step 3: Verify the migration SQL**

Open the new file under `apps/mobile/prisma/migrations/<timestamp>_add_booking_canceled_notification_types/migration.sql`. It should contain two `ALTER TYPE ... ADD VALUE` statements:

```sql
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELED_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELED_TRAINER';
```

(Postgres requires each `ADD VALUE` in its own transaction — Prisma should emit them as separate statements. If the file looks different, that's a signal something's off.)

- [ ] **Step 4: Apply migration to the dev DB**

```bash
pnpm --filter mobile prisma migrate deploy
```
Expected: the new migration applies cleanly.

(If `migrate dev` already applied it interactively in Step 2, this no-ops and reports the DB up to date — fine either way.)

- [ ] **Step 5: Type-check**

```bash
pnpm --filter mobile check-types
```
Expected: passes. No code references the new enum values yet — this only verifies the regenerated `@/generated/prisma` types are valid.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/prisma/schema.prisma apps/mobile/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(schema): add BOOKING_CANCELED_ADMIN / BOOKING_CANCELED_TRAINER enum values

Two new NotificationType variants for the cancellation fan-out coming
in this PR. Separate enum values (rather than one BOOKING_CANCELED with
a role payload) keep queries like "show me all my admin alerts" simple
and let the mobile inbox style each kind differently if it ever wants
to.
EOF
)"
```

---

## Task 3: Extend NotificationPayload with `skipPush` and propagate through `createSystemNotification`

**Files:**
- Modify: `apps/mobile/lib/server/notifications.ts`

This task adds the silent-in-app capability to the existing helper. Until now every notification with `pushEnabled=true` dispatched to Expo; now callers can request "in-app only" by passing `skipPush: true`.

- [ ] **Step 1: Add a unit-level test? No.** This module's behaviour is exercised end-to-end by integration tests (Task 6). The new branch is a single `if`. Skip a dedicated test and verify via the integration test in Task 6.

- [ ] **Step 2: Edit `NotificationPayload` and `createAndDispatchUserNotification`**

In `apps/mobile/lib/server/notifications.ts`, find the `NotificationPayload` type (around line 52) and add `skipPush`:

```typescript
type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  /**
   * When true, persist the NotificationLog but skip the Expo push dispatch.
   * Used for low-priority alerts (e.g., routine early cancellations) where
   * we want in-app visibility without a phone buzz.
   */
  skipPush?: boolean;
};
```

Then change the dispatch branch (around line 186) from:
```typescript
if (!preference.pushEnabled) {
  // Keep in-app history even when push is disabled.
  return log;
}
```
to:
```typescript
if (!preference.pushEnabled || input.skipPush) {
  // Keep in-app history when push is disabled OR explicitly silenced.
  return log;
}
```

Nothing else in this function changes — the existing tryCatch + tokens.findMany + sendExpoPushNotifications flow stays the same.

- [ ] **Step 3: Extend `createSystemNotification` to accept options**

`createSystemNotification` is the higher-level helper that resolves the user's locale and looks up the message dict. Add an optional 5th argument that lets callers pass `skipPush` (and `dedupeKey`, which it already supports inline). Find the existing signature (around line 30):

```typescript
export async function createSystemNotification(
  userId: string,
  messageKey: NotificationMessageKey,
  type: NotificationType,
  payload: Record<string, unknown>,
  dedupeKey?: string,
) {
```

Change to:
```typescript
export async function createSystemNotification(
  userId: string,
  messageKey: NotificationMessageKey,
  type: NotificationType,
  payload: Record<string, unknown>,
  options?: { dedupeKey?: string; skipPush?: boolean },
) {
```

And the body — find:
```typescript
return createAndDispatchUserNotification({
  userId,
  type,
  title,
  body,
  payload: { ...payload, messageKey: messageI18nKey },
  dedupeKey,
});
```
Change to:
```typescript
return createAndDispatchUserNotification({
  userId,
  type,
  title,
  body,
  payload: { ...payload, messageKey: messageI18nKey },
  dedupeKey: options?.dedupeKey,
  skipPush: options?.skipPush,
});
```

This is a breaking signature change for the optional 5th arg (string → object), so we need to fix existing callers. Continue to step 4.

- [ ] **Step 4: Fix existing callers of `createSystemNotification`**

```bash
grep -rn "createSystemNotification(" apps/mobile/app apps/mobile/lib apps/mobile/scripts 2>/dev/null | grep -v node_modules | grep -v "test/" | grep -v notifications.ts
```

For every caller passing a string as the 5th argument (the old `dedupeKey`), change it to `{ dedupeKey: "<that string>" }`. Callers that pass only 4 args don't need any change.

Likely call sites: `apps/mobile/app/api/bookings/+api.ts` (BOOKING_CONFIRMED, SPOT_OPENED_FROM_WAITLIST), `apps/mobile/scripts/cron/reminders.ts` (or wherever the cron lives — search), `apps/mobile/scripts/cron/package-expiry.ts`. Each cron caller passes a `dedupeKey` for retry-safety.

Example change pattern:
```typescript
// Before:
await createSystemNotification(userId, KEY, "GENERAL", { foo: 1 }, "dedupe-key-here");
// After:
await createSystemNotification(userId, KEY, "GENERAL", { foo: 1 }, { dedupeKey: "dedupe-key-here" });
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter mobile check-types
```
Expected: passes. If TS errors point to callers you missed, fix them.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/server/notifications.ts apps/mobile/app apps/mobile/scripts
git commit -m "$(cat <<'EOF'
feat(notifications): add skipPush option for silent in-app notifications

The cancellation fan-out (next commit) needs to write in-app
notifications without buzzing the phone for routine early cancels.
Adds skipPush to NotificationPayload and reshapes createSystemNotification's
5th argument from a bare dedupeKey string to an options object so we
have somewhere to put future flags. Existing callers updated.
EOF
)"
```

---

## Task 4: Add notification message keys (en + sr)

**Files:**
- Modify: `packages/i18n/src/notification-messages.ts`

This adds the two new message keys to the shared i18n dict so notifications can pull title/body from the same source as everything else.

- [ ] **Step 1: Read the current file**

Open `packages/i18n/src/notification-messages.ts`. It's small (~70 lines) and well-structured — the union type at the top, the `NOTIFICATION_MESSAGE_KEYS` const, and the `messages` dict.

- [ ] **Step 2: Add the two new keys to the union**

Find:
```typescript
export type NotificationMessageKey =
  | "BOOKING_CONFIRMED"
  | "SESSION_UPDATED"
  | "TRAINER_NOTE"
  | "GENERAL"
  | "SPOT_OPENED_FROM_WAITLIST"
  | "PACKAGE_EXPIRING_SOON"
  | "SESSION_REMINDER";
```
Add at the end:
```typescript
export type NotificationMessageKey =
  | "BOOKING_CONFIRMED"
  | "SESSION_UPDATED"
  | "TRAINER_NOTE"
  | "GENERAL"
  | "SPOT_OPENED_FROM_WAITLIST"
  | "PACKAGE_EXPIRING_SOON"
  | "SESSION_REMINDER"
  | "BOOKING_CANCELED_ADMIN"
  | "BOOKING_CANCELED_TRAINER";
```

- [ ] **Step 3: Add the two new keys to the const**

Find:
```typescript
export const NOTIFICATION_MESSAGE_KEYS = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  SESSION_UPDATED: "SESSION_UPDATED",
  TRAINER_NOTE: "TRAINER_NOTE",
  GENERAL: "GENERAL",
  SPOT_OPENED_FROM_WAITLIST: "SPOT_OPENED_FROM_WAITLIST",
  PACKAGE_EXPIRING_SOON: "PACKAGE_EXPIRING_SOON",
  SESSION_REMINDER: "SESSION_REMINDER",
} as const satisfies Record<NotificationMessageKey, NotificationMessageKey>;
```
Add at the end:
```typescript
export const NOTIFICATION_MESSAGE_KEYS = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  SESSION_UPDATED: "SESSION_UPDATED",
  TRAINER_NOTE: "TRAINER_NOTE",
  GENERAL: "GENERAL",
  SPOT_OPENED_FROM_WAITLIST: "SPOT_OPENED_FROM_WAITLIST",
  PACKAGE_EXPIRING_SOON: "PACKAGE_EXPIRING_SOON",
  SESSION_REMINDER: "SESSION_REMINDER",
  BOOKING_CANCELED_ADMIN: "BOOKING_CANCELED_ADMIN",
  BOOKING_CANCELED_TRAINER: "BOOKING_CANCELED_TRAINER",
} as const satisfies Record<NotificationMessageKey, NotificationMessageKey>;
```

- [ ] **Step 4: Add the message bodies to the dict**

Find the `messages` object (the big dict mapping each key to `{sr, en}`). Add two entries at the end (before the closing brace):

```typescript
  BOOKING_CANCELED_ADMIN: {
    sr: {
      title: "Otkazana rezervacija",
      body: "Klijent je otkazao termin.",
    },
    en: {
      title: "Booking canceled",
      body: "A client canceled their session.",
    },
  },
  BOOKING_CANCELED_TRAINER: {
    sr: {
      title: "Otkazana rezervacija",
      body: "Klijent je otkazao tvoj termin.",
    },
    en: {
      title: "Booking canceled",
      body: "A client canceled your session.",
    },
  },
```

(The bodies are intentionally short — the rich detail like "Ana Petrović canceled Reformer at 18:00, 3h before start" lives in the per-call dynamic payload, NOT in the static dict. The static dict provides fallback copy if the dynamic context isn't available.)

- [ ] **Step 5: Type-check**

```bash
pnpm --filter mobile check-types
```
Expected: passes. The exhaustive `satisfies Record<NotificationMessageKey, NotificationMessageKey>` check ensures every union variant has a corresponding const entry.

- [ ] **Step 6: Commit**

```bash
git add packages/i18n/src/notification-messages.ts
git commit -m "$(cat <<'EOF'
i18n(notifications): add BOOKING_CANCELED_ADMIN / BOOKING_CANCELED_TRAINER

Two short Serbian + English fallback titles/bodies for the new
cancellation alerts. Rich detail (client name, class, time-before-start)
comes from the per-call payload in the next commit; this dict is just
the fallback when a recipient's inbox lacks the structured payload.
Trainer variant says 'your session' to make the personal angle land.
EOF
)"
```

---

## Task 5: Build `notifyCancellation` helper

**Files:**
- Create: `apps/mobile/lib/server/notify-cancellation.ts`

This module owns the recipient resolution and fan-out logic. The route just calls one function with structured input; this file handles "who gets notified, with what content, in what mode."

- [ ] **Step 1: Write the file**

Create `apps/mobile/lib/server/notify-cancellation.ts`:

```typescript
/**
 * Cancellation notification fan-out.
 *
 * Called from POST /api/bookings (cancel branch) after the booking has been
 * marked canceled. Notifies all admins and the session's assigned trainer.
 * Push is sent for late cancellations (per shouldApplyLateCancelPenalty);
 * early cancellations create silent in-app notifications only.
 */
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { UserRole } from "@/generated/prisma";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";

export type CancellationContext = {
  sessionId: string;
  trainerUserId: string;
  clientFullName: string;
  classTypeName: string;
  sessionStartsAt: Date;
  canceledAt: Date;
  lateCancelHours: number;
};

/**
 * Dispatches one notification per recipient.
 *
 * Recipients: every active User with role=ADMIN, plus the session's trainer.
 * If a trainer is also an admin (unusual but possible) they only get the
 * trainer-flavored notification — we de-duplicate by userId before sending.
 *
 * Fire-and-forget at the call site: the route does not await this.
 */
export async function notifyCancellation(input: CancellationContext) {
  const isLate = shouldApplyLateCancelPenalty(
    input.sessionStartsAt,
    input.canceledAt,
    input.lateCancelHours,
  );
  const skipPush = !isLate;

  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, isActive: true },
    select: { id: true },
  });

  const payload = {
    sessionId: input.sessionId,
    clientFullName: input.clientFullName,
    classTypeName: input.classTypeName,
    sessionStartsAt: input.sessionStartsAt.toISOString(),
    canceledAt: input.canceledAt.toISOString(),
    isLate,
  };

  // Trainer first so dedupe by userId is straightforward below.
  await createSystemNotification(
    input.trainerUserId,
    NOTIFICATION_MESSAGE_KEYS.BOOKING_CANCELED_TRAINER,
    "BOOKING_CANCELED_TRAINER",
    payload,
    { skipPush },
  );

  for (const admin of admins) {
    if (admin.id === input.trainerUserId) continue; // already notified above
    await createSystemNotification(
      admin.id,
      NOTIFICATION_MESSAGE_KEYS.BOOKING_CANCELED_ADMIN,
      "BOOKING_CANCELED_ADMIN",
      payload,
      { skipPush },
    );
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter mobile check-types
```
Expected: passes. `BOOKING_CANCELED_ADMIN` and `BOOKING_CANCELED_TRAINER` are now valid `NotificationType` enum values (from Task 2) and valid `NotificationMessageKey` union members (from Task 4). `createSystemNotification`'s 5th argument is now `options?: { skipPush?: boolean; dedupeKey?: string }` (from Task 3).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/server/notify-cancellation.ts
git commit -m "$(cat <<'EOF'
feat(server): notifyCancellation fan-out helper

Resolves recipients (every active admin + the session's trainer),
de-duplicates if a user wears both hats, and dispatches one
notification per recipient via createSystemNotification.

Push vs. silent is decided by the existing shouldApplyLateCancelPenalty
helper — late cancels push, early cancels stay in-app only — so the
gating logic matches the package-consumption rule the same cancel
endpoint already enforces.
EOF
)"
```

---

## Task 6: Wire the helper into the booking cancel branch + integration tests

**Files:**
- Modify: `apps/mobile/app/api/bookings/+api.ts`
- Modify: `apps/mobile/test/integration/bookings-cancel.test.ts`

This task hooks the fan-out into the route. TDD: tests first.

- [ ] **Step 1: Add failing integration tests**

In `apps/mobile/test/integration/bookings-cancel.test.ts`, add the following at the BOTTOM of the existing `describe(...)` block (replace the file's `vi.mock("@/lib/server/notifications", ...)` block first — we want to mock `notify-cancellation` instead, OR keep `createSystemNotification` mocked and inspect its calls).

For the test plan, **swap the mock to spy on `createSystemNotification` calls** (the test file already does this; verify the mock returns a `vi.fn`). Then add these tests:

```typescript
import { createSystemNotification } from "@/lib/server/notifications";

const createSystemNotificationMock = vi.mocked(createSystemNotification);

describe("cancellation fan-out", () => {
  // Note: beforeEach in the outer describe already calls resetDb()
  // and clears the createSystemNotification mock if we reset it.
  // If it doesn't reset, do it explicitly:
  //   beforeEach(() => createSystemNotificationMock.mockClear());

  it("late cancel pushes BOOKING_CANCELED to the trainer", async () => {
    const baseline = await seedBaseline();
    const session = await createFutureSession({
      classTypeId: baseline.reformer.id,
      trainerUserId: baseline.trainer.id,
      startsAtMsFromNow: 2 * HOUR_MS, // <12h cutoff = late
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: baseline.clientProfile.id,
        clientPackageId: baseline.clientPackage.id,
      },
    });
    asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

    createSystemNotificationMock.mockClear();
    const res = await POST(buildClientCancelRequest(session.id));
    expect(res.status).toBe(200);

    // Trainer should get a push (skipPush=false).
    const trainerCall = createSystemNotificationMock.mock.calls.find(
      (call) => call[0] === baseline.trainer.id && call[2] === "BOOKING_CANCELED_TRAINER",
    );
    expect(trainerCall).toBeDefined();
    expect(trainerCall![4]).toMatchObject({ skipPush: false });
  });

  it("early cancel records silent (skipPush=true) for the trainer", async () => {
    const baseline = await seedBaseline();
    const session = await createFutureSession({
      classTypeId: baseline.reformer.id,
      trainerUserId: baseline.trainer.id,
      startsAtMsFromNow: 48 * HOUR_MS, // far before cutoff = early
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: baseline.clientProfile.id,
        clientPackageId: baseline.clientPackage.id,
      },
    });
    asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

    createSystemNotificationMock.mockClear();
    const res = await POST(buildClientCancelRequest(session.id));
    expect(res.status).toBe(200);

    const trainerCall = createSystemNotificationMock.mock.calls.find(
      (call) => call[0] === baseline.trainer.id && call[2] === "BOOKING_CANCELED_TRAINER",
    );
    expect(trainerCall).toBeDefined();
    expect(trainerCall![4]).toMatchObject({ skipPush: true });
  });

  it("every active admin is notified on cancel", async () => {
    const baseline = await seedBaseline();
    const admin1 = await prisma.user.create({
      data: { email: "admin1@test.local", fullName: "Admin One", role: "ADMIN" },
    });
    const admin2 = await prisma.user.create({
      data: { email: "admin2@test.local", fullName: "Admin Two", role: "ADMIN" },
    });
    const session = await createFutureSession({
      classTypeId: baseline.reformer.id,
      trainerUserId: baseline.trainer.id,
      startsAtMsFromNow: 2 * HOUR_MS,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: baseline.clientProfile.id,
        clientPackageId: baseline.clientPackage.id,
      },
    });
    asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

    createSystemNotificationMock.mockClear();
    await POST(buildClientCancelRequest(session.id));

    const adminCalls = createSystemNotificationMock.mock.calls.filter(
      (call) => call[2] === "BOOKING_CANCELED_ADMIN",
    );
    const notifiedAdminIds = adminCalls.map((call) => call[0]).sort();
    expect(notifiedAdminIds).toEqual([admin1.id, admin2.id].sort());
  });

  it("trainer-is-also-admin gets only the trainer notification (no duplicate)", async () => {
    const baseline = await seedBaseline();
    // Promote the trainer to ADMIN too (rare but possible).
    await prisma.user.update({
      where: { id: baseline.trainer.id },
      data: { role: "ADMIN" },
    });
    const session = await createFutureSession({
      classTypeId: baseline.reformer.id,
      trainerUserId: baseline.trainer.id,
      startsAtMsFromNow: 2 * HOUR_MS,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: baseline.clientProfile.id,
        clientPackageId: baseline.clientPackage.id,
      },
    });
    asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

    createSystemNotificationMock.mockClear();
    await POST(buildClientCancelRequest(session.id));

    const callsForTrainerUser = createSystemNotificationMock.mock.calls.filter(
      (call) => call[0] === baseline.trainer.id,
    );
    expect(callsForTrainerUser).toHaveLength(1);
    expect(callsForTrainerUser[0][2]).toBe("BOOKING_CANCELED_TRAINER");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
pnpm --filter mobile test:integration bookings-cancel
```
Expected: the 4 new tests FAIL (cancel branch doesn't call `notifyCancellation` yet). Pre-existing tests still pass.

- [ ] **Step 3: Wire the helper into the route**

In `apps/mobile/app/api/bookings/+api.ts`:

a) Add the import near the top:
```typescript
import { notifyCancellation } from "@/lib/server/notify-cancellation";
```

b) Expand the session selector (around line 26) to include the trainer and a class-type name for the payload:

Find:
```typescript
const session = await prisma.session.findUnique({
  where: { id: sessionId },
  select: {
    id: true,
    startsAt: true,
    capacity: true,
    status: true,
    classTypeId: true,
  },
});
```
Change to:
```typescript
const session = await prisma.session.findUnique({
  where: { id: sessionId },
  select: {
    id: true,
    startsAt: true,
    capacity: true,
    status: true,
    classTypeId: true,
    trainerUserId: true,
    classType: { select: { name: true } },
  },
});
```

c) Find the client's profile so we have `fullName` for the payload. The cancel branch already loads `activeBooking` with `clientPackage`; piggyback by also selecting the client's user. Locate the `findUnique` for `activeBooking` (around line 129):

Find:
```typescript
const activeBooking = await prisma.booking.findUnique({
  where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
  select: {
    id: true,
    canceledAt: true,
    clientPackageId: true,
    clientPackage: {
      select: {
        id: true,
        lateCancelHours: true,
      },
    },
  },
});
```
Change to:
```typescript
const activeBooking = await prisma.booking.findUnique({
  where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
  select: {
    id: true,
    canceledAt: true,
    clientPackageId: true,
    clientPackage: {
      select: {
        id: true,
        lateCancelHours: true,
      },
    },
    clientProfile: {
      select: { user: { select: { fullName: true } } },
    },
  },
});
```

d) After the booking is marked canceled and after the late-cancel-penalty / waitlist logic runs, but BEFORE the `if (promoted)` return, add the fire-and-forget fan-out. Look for the `const promoted = await prisma.$transaction(...)` block (around line 197); the call goes RIGHT BEFORE the `if (promoted)` check (around line 281):

Find:
```typescript
  if (promoted) {
    // Notify promoted client that they now hold a confirmed booking.
    void createSystemNotification(promoted, NOTIFICATION_MESSAGE_KEYS.SPOT_OPENED_FROM_WAITLIST, "BOOKING_CONFIRMED", {
      sessionId,
      state: "WAITLIST_PROMOTED",
    });
    return ok({ success: true, state: "WAITLIST_PROMOTED" });
  }

  return ok({ success: true, state: "CANCELED" });
```
Insert RIGHT BEFORE the `if (promoted)`:
```typescript
  if (activeBooking && !activeBooking.canceledAt) {
    // Fan-out: notify admins + trainer.
    // Fire-and-forget: do not block the response on email/push delivery.
    const lateCancelHours = activeBooking.clientPackage?.lateCancelHours ?? 0;
    void notifyCancellation({
      sessionId,
      trainerUserId: session.trainerUserId,
      clientFullName: activeBooking.clientProfile.user.fullName,
      classTypeName: session.classType.name,
      sessionStartsAt: session.startsAt,
      canceledAt: cancellationTime,
      lateCancelHours,
    });
  }
```

The guard `if (activeBooking && !activeBooking.canceledAt)` mirrors the existing penalty-application guard — we only fire the fan-out when the cancel is *new* (idempotent cancels of an already-canceled booking don't re-notify).

e) Also update the existing `createSystemNotification` calls in this file to use the new options-object 5th argument (Task 3 changed the signature). Find the two existing calls — one for `BOOKING_CONFIRMED` (around line 120) and one for `SPOT_OPENED_FROM_WAITLIST` (around line 283). They look like:
```typescript
void createSystemNotification(guard.user.id, NOTIFICATION_MESSAGE_KEYS.BOOKING_CONFIRMED, "BOOKING_CONFIRMED", { sessionId, state: "BOOKED" });
```
These take only 4 args (no `dedupeKey`), so Task 3's signature change doesn't affect them — they should still compile. No changes here unless `check-types` complains.

- [ ] **Step 4: Run tests, confirm they pass**

```bash
pnpm --filter mobile test:integration bookings-cancel
```
Expected: ALL tests in the file pass — the 4 new ones plus all pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/api/bookings/+api.ts apps/mobile/test/integration/bookings-cancel.test.ts
git commit -m "$(cat <<'EOF'
feat(api): notify admins + trainer on booking cancel

Cancel branch of POST /api/bookings now fires notifyCancellation
(fire-and-forget) after the booking is marked canceled. The session
selector and activeBooking selector each gained the fields the
fan-out needs (trainerUserId, classType.name, clientProfile.user.fullName)
in a single round-trip rather than re-querying.

Late cancels reach the recipients' phones as Expo pushes; early
cancels show up in their in-app inbox without buzzing — matches the
late-cancel-penalty rule the same endpoint already enforces for
package consumption.
EOF
)"
```

---

## Task 7: Update CONTEXT.md

**Files:**
- Modify: `CONTEXT.md`

The grilling session that produced this PR drafted a "Cancellation notification" entry under a new `### Notifications` section. We held off on adding it to `dev` when we split into three PRs; now is the time.

- [ ] **Step 1: Insert the Notifications section**

In `CONTEXT.md`, find the `### Cron` section. The `### Notifications` section goes *after* `### Cron` and *before* `### Test fixtures`.

Add this block right after the `cron:package-expiry` paragraph (before the blank line that precedes `### Test fixtures`):

```markdown

### Notifications

**Cancellation notification**:
Every Booking cancellation generates a NotificationLog row for **all admins** and for **the Session's assigned Trainer**. Late cancellations (per `shouldApplyLateCancelPenalty`) trigger an Expo push; early cancellations are silent in-app (NotificationLog created, no push). If a Trainer is also an Admin, they receive only the Trainer-flavored notification. The waitlist auto-promotion notification to the promoted Client is unrelated and unchanged.
```

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md
git commit -m "$(cat <<'EOF'
docs(context): document cancellation notification fan-out

Cancellation notifications were designed during the same grilling
session as PR 1 (client DOB) and PR 3 (birthday gift) but
intentionally held back from the dev branch until each PR's
implementation lands. This commit closes that loop for PR 2.
EOF
)"
```

---

## Task 8: Final sweep + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Full test suite**

```bash
pnpm --filter mobile test:unit
pnpm --filter mobile test:integration
pnpm --filter mobile check-types
pnpm lint
```
Expected: all green (or only pre-existing warnings on lint).

- [ ] **Step 2: Confirm no stray files**

```bash
git status --short
git log --oneline dev..HEAD
```
Expected: empty status; ~6 commits since `dev`.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/cancel-notifications
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base dev --title "feat: cancellation notifications for admin + trainer" --body "$(cat <<'EOF'
## Summary
- New \`notifyCancellation\` helper fans out to every active admin user plus the session's assigned trainer when a client cancels a booking.
- Late cancellations (per existing \`shouldApplyLateCancelPenalty\`) push to phone; early cancellations are silent in-app only.
- New \`NotificationType\` enum values \`BOOKING_CANCELED_ADMIN\` and \`BOOKING_CANCELED_TRAINER\` (separate variants for clean per-role filtering).
- New \`skipPush\` option on the notifications helper to support silent-in-app delivery without a parallel code path.
- Updated \`CONTEXT.md\` to document the new section.

## Architecture
- Recipients resolved at fan-out time (\`prisma.user.findMany({ role: ADMIN, isActive: true })\` + the session's \`trainerUserId\`).
- De-duplication: if a trainer is also an admin, they receive only the trainer-flavored notification.
- Push vs. silent gate reuses \`shouldApplyLateCancelPenalty\` — the same predicate that already drives package consumption on this endpoint. Single source of truth for "is this cancel late?".
- Fire-and-forget at the route — the booking-cancel response does not block on email/push delivery.

## Test plan
- [x] Integration: late cancel produces \`skipPush: false\` for trainer.
- [x] Integration: early cancel produces \`skipPush: true\` for trainer.
- [x] Integration: every active admin receives a \`BOOKING_CANCELED_ADMIN\` call.
- [x] Integration: trainer-also-admin receives exactly one notification (the trainer variant), no duplicate.
- [x] Full integration suite green (no regressions to existing bookings-cancel tests).
- [x] \`pnpm --filter mobile check-types\` clean.
- [x] \`pnpm lint\` clean (0 errors).
- [x] Migration is additive (two enum values) — safe to roll back.

## Out of scope
- Birthday gift flow → PR 3 (depends on this PR's notification infrastructure but is otherwise independent).
- Legal consent gate docs → separate \`docs/legal-consent-gate\` branch.
EOF
)"
```

- [ ] **Step 5: Return the PR URL**

Capture the URL printed by `gh pr create`. Done.

---

## Self-review pass

**Spec coverage:**
- Every cancellation generates a notification → Task 6 ✓
- All admins + session trainer get notified → Task 5 (recipient resolution) ✓
- Late cancels push, early cancels silent → Task 5 (skipPush gate) ✓
- Push vs. silent reuses `shouldApplyLateCancelPenalty` → Task 5 ✓
- Trainer-is-also-admin deduplicates → Task 5 (continue on match) + Task 6 test ✓
- Two separate NotificationType variants → Task 2 ✓
- i18n copy in sr + en → Task 4 ✓
- CONTEXT.md updated → Task 7 ✓

**Placeholder scan:** no TBDs, no hand-waving on validation, every step has actual code or shell commands.

**Type consistency:**
- `NotificationType` enum values `BOOKING_CANCELED_ADMIN` / `BOOKING_CANCELED_TRAINER` defined in Task 2, used in Tasks 5 and 6.
- `NotificationMessageKey` union variants `BOOKING_CANCELED_ADMIN` / `BOOKING_CANCELED_TRAINER` defined in Task 4, used in Task 5.
- `createSystemNotification`'s 5th arg shape `{ dedupeKey?; skipPush? }` defined in Task 3, used in Task 5.
- `CancellationContext` type defined in Task 5, used in Task 6's wiring.
- `notifyCancellation` takes a single object arg per Task 5; Task 6's call site matches.

**Cross-PR consistency:**
- This PR does NOT modify `seed-e2e.ts` — the cancel fan-out doesn't need a fixture change.
- This PR does NOT modify `apps/mobile/locales/{sr,en}.json` — those locale files are for UI strings; notification copy lives in `@baza/i18n`'s `notification-messages.ts` (the dict the mobile in-app inbox reads).
- PR 1 (client DOB) is already merged; this PR builds on the post-merge `dev` tip.
- PR 3 (birthday gift + cron) reads `Notification` infrastructure this PR establishes — `skipPush` could be reused there but isn't required.
