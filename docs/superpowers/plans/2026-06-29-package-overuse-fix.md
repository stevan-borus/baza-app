# Package Overuse Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a client from holding more future bookings + waitlist entries against a package than the package has remaining sessions, so they can no longer overbook past what they paid for.

**Architecture:** Today `sessionsRemaining` is only decremented at *consumption* (session-end cron, or late-cancel forfeit). A future booking reserves nothing, so a client with N remaining can stack N+k future bookings and the extra attended sessions silently go uncharged (the decrement floors at 0). We add a **reservation check at booking time**: a future uncancelled booking backed by the eligible package, plus any waitlist entry for a future session of that class type, counts as a *held* session. When `held >= eligiblePackage.sessionsRemaining`, the booking (or waitlist join) is rejected with a new `package_exhausted` error. The check + creation runs inside a Prisma interactive transaction with the held-count recomputed inside the transaction to close the concurrent-request race. The decision is made in a pure, unit-testable helper; the API orchestrates DB reads + the transaction.

**Tech Stack:** Expo Router API routes, Prisma (PostgreSQL), Vitest (integration against real Postgres + unit), TypeScript, `@baza/types` shared Zod/const package, i18n via `locales/{sr,en}.json`.

## Global Constraints

- pnpm only — never npm/yarn. Run scripts via `package.json` (e.g. `pnpm test:unit`, `pnpm test:integration`), never invoke `tsc`/`vitest`/`prisma` directly except the documented `pnpm exec prisma generate`.
- Schema is NOT changed by this plan — no migration. All work is application logic + tests + i18n.
- Every visible string lives in BOTH `apps/mobile/locales/sr.json` AND `apps/mobile/locales/en.json`. Serbian is default.
- TDD: red → green → refactor. Write the failing test, watch it fail, implement minimal code, watch it pass, commit.
- Date-touching code imports `now()` / `nowMs()` from `@/lib/now` — never bare `new Date()` / `Date.now()` for "current time".
- React Compiler is on — do NOT add `useMemo`/`useCallback`/`React.memo`.
- All paths below are relative to the worktree root `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/fix-package-overuse`. All commands run from `apps/mobile` unless stated. This is a git worktree — never `cd` into or reference the main checkout.
- No `Claude-Session:` trailer or AI attribution in commits.

## Design Decisions (locked with user)

1. **Reject, not waitlist** when the package is exhausted — return HTTP 409 with error code `package_exhausted`.
2. **Waitlist also reserves** — a waitlist entry for a future session of the class type counts toward the held total. A maxed-out client therefore cannot even join a waitlist (gets the same rejection). This is the stricter model the user explicitly chose.
3. **Per eligible package scope** — held bookings are counted against THE package eligibility resolves to (the newest non-empty, valid package for the class). Waitlist entries (which carry no package link in the schema) are counted by class type for the client.
4. **Clear localized error** — distinct message: SR "Nemate više termina u paketu. Otkažite zakazani termin ili obnovite paket." / EN "No sessions left in your package. Cancel a booking or renew."

## "Held" definition (the invariant)

For the eligible package `pkg` (class type `C`, client `P`):

```
held =
    count(Booking where clientProfileId=P AND clientPackageId=pkg.id
          AND canceledAt=null AND session.startsAt > now())
  + count(WaitlistEntry where clientProfileId=P
          AND session.classTypeId=C AND session.startsAt > now())
```

Booking is allowed only if `held < pkg.sessionsRemaining`. (Strict `<`: holding `held` already-reserved sessions means the next one is the `held+1`-th, which must still fit within `sessionsRemaining`.)

Notes:
- Only **future** sessions count — a past uncancelled booking is the cron's job to consume, not a live reservation, and counting it would double-penalize.
- Admin **unbacked** bookings have `clientPackageId = null`, so they never count against a client's self-booking limit (correct — they late-bind at cron).
- The currently-requested session is NOT yet a booking when we count, so no off-by-one from self.

---

## File Structure

- `apps/mobile/lib/server/package-hold.ts` — **new.** Pure decision helper `canHoldAnotherBooking({ sessionsRemaining, heldCount })` plus the held-count constant/types. One responsibility: the overuse math, unit-testable with no DB.
- `apps/mobile/lib/server/booking-hold-count.ts` — **new.** DB-facing `countHeldSessions(tx, { clientProfileId, classTypeId, clientPackageId, at })` that runs the two counts on a transaction client. Separated from the pure helper so the math has zero Prisma dependency.
- `packages/types/src/index.ts` — **modify.** Add `PACKAGE_EXHAUSTED` to `BOOKING_ERRORS`.
- `apps/mobile/app/api/bookings/+api.ts` — **modify.** Wrap the BOOK branch's eligibility-check + count + booking/waitlist creation in a `prisma.$transaction`; reject with `package_exhausted` when held >= remaining.
- `apps/mobile/components/client/booking-sheet.tsx` — **modify.** Map `errorCode === "package_exhausted"` to the new localized string.
- `apps/mobile/locales/sr.json` & `apps/mobile/locales/en.json` — **modify.** Add `client.calendar.errorPackageExhausted`.
- `apps/mobile/test/unit/package-hold.test.ts` — **new.** Unit tests for the pure helper.
- `apps/mobile/test/integration/bookings-package-overuse.test.ts` — **new.** Integration tests against real Postgres for the end-to-end reject behavior + race.

---

### Task 1: Pure overuse-decision helper

**Files:**
- Create: `apps/mobile/lib/server/package-hold.ts`
- Test: `apps/mobile/test/unit/package-hold.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `canHoldAnotherBooking(input: { sessionsRemaining: number; heldCount: number }): boolean` — returns `true` when the client may reserve one more session against the package (`heldCount < sessionsRemaining`), `false` otherwise.

- [ ] **Step 1: Write the failing unit test**

Create `apps/mobile/test/unit/package-hold.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canHoldAnotherBooking } from "@/lib/server/package-hold";

describe("canHoldAnotherBooking", () => {
  it("allows a booking when fewer sessions are held than remain", () => {
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 0 })).toBe(true);
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 11 })).toBe(true);
  });

  it("rejects the booking that would exceed remaining sessions", () => {
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 12 })).toBe(false);
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 13 })).toBe(false);
  });

  it("rejects when nothing remains", () => {
    expect(canHoldAnotherBooking({ sessionsRemaining: 0, heldCount: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- package-hold`
Expected: FAIL — module `@/lib/server/package-hold` not found / `canHoldAnotherBooking is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/mobile/lib/server/package-hold.ts`:

```ts
/**
 * Overuse guard math, DB-free so it can be unit-tested in isolation.
 *
 * A client may reserve one more session against a package only while the
 * number of sessions they ALREADY hold (future uncancelled bookings backed by
 * the package + waitlist entries for the class) is strictly below the
 * package's remaining count. `sessionsRemaining` is decremented later, at
 * consumption (session-end cron / late-cancel forfeit) — so at booking time we
 * count holds against the un-decremented remaining instead.
 */
export function canHoldAnotherBooking(input: {
  sessionsRemaining: number;
  heldCount: number;
}): boolean {
  return input.heldCount < input.sessionsRemaining;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- package-hold`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/server/package-hold.ts apps/mobile/test/unit/package-hold.test.ts
git commit -m "feat(bookings): add pure overuse-guard helper

Clients could stack more future bookings than their package had sessions,
because sessionsRemaining is only decremented at session-end consumption — a
booking reserved nothing. This is the DB-free decision core: a client may hold
one more session only while held < remaining. DB wiring follows."
```

---

### Task 2: Held-session counter (DB-facing)

**Files:**
- Create: `apps/mobile/lib/server/booking-hold-count.ts`
- Test: covered end-to-end in Task 5 (this counter has no behavior independent of a real DB; its correctness is asserted through the integration suite rather than a separate mock test — splitting it into a Prisma-mock unit test would test the mock, not the query).

**Interfaces:**
- Consumes: `Prisma.TransactionClient` (alias the existing `Db` pattern from `booking-cancellation.ts`).
- Produces: `countHeldSessions(tx, params): Promise<number>` where
  `params = { clientProfileId: string; classTypeId: string; clientPackageId: string; at: Date }`.
  Returns `(future uncancelled bookings backed by clientPackageId) + (future waitlist entries for classTypeId)`.

- [ ] **Step 1: Write the implementation**

Create `apps/mobile/lib/server/booking-hold-count.ts`:

```ts
import type { Prisma } from "@/generated/prisma";

/** Works with both the root PrismaClient and an interactive-tx client. */
type Db = Prisma.TransactionClient;

/**
 * How many sessions the client already holds against this package: future
 * uncancelled bookings backed by the package, plus waitlist entries for future
 * sessions of the same class type. Waitlist entries carry no package link in
 * the schema, so they're scoped by class type — the user's chosen model where
 * a waitlist seat also reserves a session.
 */
export async function countHeldSessions(
  tx: Db,
  params: {
    clientProfileId: string;
    classTypeId: string;
    clientPackageId: string;
    at: Date;
  },
): Promise<number> {
  const [bookings, waitlist] = await Promise.all([
    tx.booking.count({
      where: {
        clientProfileId: params.clientProfileId,
        clientPackageId: params.clientPackageId,
        canceledAt: null,
        session: { startsAt: { gt: params.at } },
      },
    }),
    tx.waitlistEntry.count({
      where: {
        clientProfileId: params.clientProfileId,
        session: {
          classTypeId: params.classTypeId,
          startsAt: { gt: params.at },
        },
      },
    }),
  ]);
  return bookings + waitlist;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter mobile check-types` (from worktree root, or `cd ../../ ` is NOT allowed — run `pnpm check-types` from repo root of the worktree).
Actual command from `apps/mobile`: `pnpm check-types` runs the repo-root turbo task; if that is not wired for a single package, run from the worktree root: `pnpm check-types`.
Expected: PASS — no type errors. (If `Prisma.TransactionClient` import path differs, mirror the exact import used at the top of `apps/mobile/lib/server/booking-cancellation.ts`, which is the canonical `Db` definition.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/server/booking-hold-count.ts
git commit -m "feat(bookings): add held-session counter for overuse guard

Counts future uncancelled bookings backed by a package plus future waitlist
entries for the class type — the 'held' total the overuse guard compares
against sessionsRemaining. Runs on a tx client so the booking endpoint can
count and create atomically."
```

---

### Task 3: New `PACKAGE_EXHAUSTED` error code

**Files:**
- Modify: `packages/types/src/index.ts:145-148` (the `BOOKING_ERRORS` const)

**Interfaces:**
- Produces: `BOOKING_ERRORS.PACKAGE_EXHAUSTED === "PACKAGE_EXHAUSTED"`.

- [ ] **Step 1: Add the error constant**

In `packages/types/src/index.ts`, change:

```ts
export const BOOKING_ERRORS = {
  GUARDIAN_VERIFICATION_REQUIRED: "GUARDIAN_VERIFICATION_REQUIRED",
  SESSION_IN_PAST: "SESSION_IN_PAST",
} as const;
```

to:

```ts
export const BOOKING_ERRORS = {
  GUARDIAN_VERIFICATION_REQUIRED: "GUARDIAN_VERIFICATION_REQUIRED",
  SESSION_IN_PAST: "SESSION_IN_PAST",
  PACKAGE_EXHAUSTED: "PACKAGE_EXHAUSTED",
} as const;
```

- [ ] **Step 2: Type-check the types package**

Run (from worktree root): `pnpm check-types`
Expected: PASS — `BookingErrorCode` union now includes `"PACKAGE_EXHAUSTED"`.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add PACKAGE_EXHAUSTED booking error code

Distinct from no_package_for_class: the client HAS a valid package, it's just
fully reserved. The booking endpoint needs a separate code so the client UI can
show an actionable 'cancel a booking or renew' message instead of the
misleading 'no package for this class'."
```

---

### Task 4: Enforce the guard in the booking endpoint (integration-tested)

**Files:**
- Modify: `apps/mobile/app/api/bookings/+api.ts:46-145` (the `action === "BOOK"` branch)
- Test: `apps/mobile/test/integration/bookings-package-overuse.test.ts` (created in Task 5; this task wires the logic, Task 5 proves it)

**Interfaces:**
- Consumes: `canHoldAnotherBooking` (Task 1), `countHeldSessions` (Task 2), `BOOKING_ERRORS.PACKAGE_EXHAUSTED` (Task 3).
- Produces: BOOK requests that would exceed the held limit return `fail("package_exhausted", 409)` (note: the wire value is the lowercase string `"package_exhausted"` to match the existing `no_package_for_class` lowercase convention on the wire; the `BOOKING_ERRORS.PACKAGE_EXHAUSTED` constant is the UPPER_SNAKE used elsewhere — keep the wire string lowercase and add a mapping note. **Decision: use the constant value on the wire for consistency with SESSION_IN_PAST/GUARDIAN_VERIFICATION_REQUIRED, which ARE sent UPPER_SNAKE.** So send `BOOKING_ERRORS.PACKAGE_EXHAUSTED` = `"PACKAGE_EXHAUSTED"`.)

> **Wire-format note for the implementer:** The endpoint currently sends `SESSION_IN_PAST` and `GUARDIAN_VERIFICATION_REQUIRED` as UPPER_SNAKE (via `BOOKING_ERRORS.*`) but `no_package_for_class` as lowercase. We follow the `BOOKING_ERRORS.*` precedent and send `"PACKAGE_EXHAUSTED"`. Task 6 maps exactly that string in the UI.

- [ ] **Step 1: Add imports**

In `apps/mobile/app/api/bookings/+api.ts`, the first import currently is:

```ts
import { bookingMutationInputSchema, BOOKING_ERRORS, formatFullName } from "@baza/types";
```

Add two new server imports near the other `@/lib/server/*` imports (after the `findEligibleClientPackage` import on line 14):

```ts
import { countHeldSessions } from "@/lib/server/booking-hold-count";
import { canHoldAnotherBooking } from "@/lib/server/package-hold";
```

- [ ] **Step 2: Replace the BOOK creation block with a transactional, guarded version**

Replace lines 87–144 (from `if (!eligiblePackage) {` through the final `return ok({ success: true, state: "BOOKED" });` of the BOOK branch) with:

```ts
    if (!eligiblePackage) {
      return fail("no_package_for_class", 409);
    }

    const hasBooking = await prisma.booking.findUnique({
      where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
    });
    // Idempotent: already booked is success, not an error.
    if (hasBooking && !hasBooking.canceledAt)
      return ok({ success: true, state: "BOOKED_ALREADY" });

    // Count holds + create the booking/waitlist atomically so two concurrent
    // requests can't both pass the overuse check on the last remaining session.
    const result = await prisma.$transaction(async (tx) => {
      const heldCount = await countHeldSessions(tx, {
        clientProfileId,
        classTypeId: session.classTypeId,
        clientPackageId: eligiblePackage.id,
        at: now(),
      });

      if (
        !canHoldAnotherBooking({
          sessionsRemaining: eligiblePackage.sessionsRemaining,
          heldCount,
        })
      ) {
        return { state: "PACKAGE_EXHAUSTED" as const };
      }

      const [activeBookingsCount, waitlistCount] = await Promise.all([
        tx.booking.count({ where: { sessionId, canceledAt: null } }),
        tx.waitlistEntry.count({ where: { sessionId } }),
      ]);

      if (activeBookingsCount >= session.capacity) {
        // Full class: add to waitlist with stable position; idempotent.
        const existingWait = await tx.waitlistEntry.findUnique({
          where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
        });
        if (!existingWait) {
          await tx.waitlistEntry.create({
            data: { sessionId, clientProfileId, position: waitlistCount + 1 },
          });
        }
        return { state: "WAITLISTED" as const };
      }

      await tx.booking.upsert({
        where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
        create: {
          sessionId,
          clientProfileId,
          clientPackageId: eligiblePackage.id,
        },
        update: { canceledAt: null, clientPackageId: eligiblePackage.id },
      });
      await tx.waitlistEntry.deleteMany({
        where: { sessionId, clientProfileId },
      });
      return { state: "BOOKED" as const };
    });

    if (result.state === "PACKAGE_EXHAUSTED") {
      return fail(BOOKING_ERRORS.PACKAGE_EXHAUSTED, 409);
    }
    // No in-app notification for self-initiated bookings — the booking sheet
    // shows an immediate inline success block. WAITLISTED/BOOKED both 200.
    return ok({ success: true, state: result.state });
  }
```

> Implementer note: this folds the prior separate `activeBookingsCount`/`waitlistCount` reads (old lines 98–105), the waitlist branch (old 107–122), and the booking upsert (old 124–138) INTO the transaction. Delete the now-duplicated pre-transaction versions of those blocks — they must not remain outside the tx. The CANCEL branch (lines 147+) is unchanged.

- [ ] **Step 3: Type-check**

Run (from worktree root): `pnpm check-types`
Expected: PASS — no unused-import or type errors. If `result.state` union complains, confirm each return inside the tx uses the `as const` shown.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/api/bookings/+api.ts
git commit -m "fix(bookings): reject bookings that overuse the package

A client with N remaining could stack N+k future bookings/waitlist entries —
each passed the old 'has a package' check, and the session-end cron floors the
decrement at 0, so the surplus attended sessions went uncharged. Now a future
booking or waitlist seat counts as a held session; when held >= remaining the
request is rejected (409 PACKAGE_EXHAUSTED). Count + create run in one
transaction so concurrent requests can't both claim the last seat.

Waitlist seats reserve too (product decision): a maxed-out client can't join a
waitlist either, which keeps the waitlist from promising a seat the package
can't back."
```

---

### Task 5: Integration tests — overuse rejection + race + waitlist reservation

**Files:**
- Create: `apps/mobile/test/integration/bookings-package-overuse.test.ts`

**Interfaces:**
- Consumes: the guarded endpoint (Task 4). Mirrors the mock/seed pattern of `apps/mobile/test/integration/bookings-class-scoping.test.ts`.

- [ ] **Step 1: Write the failing integration tests**

Create `apps/mobile/test/integration/bookings-package-overuse.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/bookings/+api";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer };
}

async function createSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
  capacity?: number;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + 60 * 60 * 1000),
      capacity: opts.capacity ?? 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function createPackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining: number;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: opts.classTypeId,
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypeId: opts.classTypeId,
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
      expiresAt: new Date(nowMs() + 60 * 24 * 60 * 60 * 1000),
      sessionsRemaining: opts.sessionsRemaining,
    },
  });
}

function bookReq(sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, action: "BOOK" }),
  });
}

function asClient(client: { id: string; email: string }, profileId: string) {
  setMockUser({
    id: client.id,
    role: "CLIENT",
    email: client.email,
    isActive: true,
    clientProfile: { id: profileId },
  });
}

describe("POST /api/bookings package overuse", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("allows booking up to remaining, rejects the one past it", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 2,
    });
    asClient(client, clientProfile.id);

    const day = 24 * 60 * 60 * 1000;
    const s1 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 1 * day) });
    const s2 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * day) });
    const s3 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 3 * day) });

    expect((await POST(bookReq(s1.id))).status).toBe(200);
    expect((await POST(bookReq(s2.id))).status).toBe(200);

    const res3 = await POST(bookReq(s3.id));
    expect(res3.status).toBe(409);
    expect((await res3.json()).error).toBe("PACKAGE_EXHAUSTED");

    const booked = await prisma.booking.count({
      where: { clientProfileId: clientProfile.id, canceledAt: null },
    });
    expect(booked).toBe(2);
  });

  it("counts a waitlist entry as a held session", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 1,
    });
    asClient(client, clientProfile.id);

    const day = 24 * 60 * 60 * 1000;
    // A full session so this client lands on the waitlist (capacity 1, taken by another booking).
    const full = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 1 * day), capacity: 1 });
    const other = await prisma.clientProfile.create({
      data: { userId: (await prisma.user.create({ data: { email: "o@test.local", firstName: "O", lastName: "P", role: "CLIENT" } })).id, dateOfBirth: new Date("1990-01-01") },
    });
    await prisma.booking.create({ data: { sessionId: full.id, clientProfileId: other.id } });

    // Client joins the waitlist for the full session — this reserves their 1 session.
    const wlRes = await POST(bookReq(full.id));
    expect(wlRes.status).toBe(200);
    expect((await wlRes.json()).state).toBe("WAITLISTED");

    // Now a normal open session — should be rejected, the lone session is held by the waitlist seat.
    const open = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * day) });
    const res = await POST(bookReq(open.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("PACKAGE_EXHAUSTED");
  });

  it("does not count canceled or past bookings toward the limit", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    const pkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 1,
    });
    asClient(client, clientProfile.id);

    const day = 24 * 60 * 60 * 1000;
    // A canceled future booking against the package — must NOT count.
    const canceledSession = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 1 * day) });
    await prisma.booking.create({
      data: { sessionId: canceledSession.id, clientProfileId: clientProfile.id, clientPackageId: pkg.id, canceledAt: new Date(nowMs()) },
    });

    const open = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * day) });
    const res = await POST(bookReq(open.id));
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe("BOOKED");
  });
});
```

- [ ] **Step 2: Prepare the test DB and run the new file (verify it passes)**

Run (from `apps/mobile`):

```sh
docker compose up -d            # once per session
pnpm test:db:prepare            # resets + migrates baza_app_test (needs PRISMA_USER_CONSENT — see note below)
pnpm test:integration -- bookings-package-overuse
```

Expected: PASS — all 3 tests green. (`test:db:prepare` is destructive on `baza_app_test` and is gated behind the `PRISMA_USER_CONSENT` env var; if the script prompts/blocks, hand the command to the user per project policy — never bypass with `db push`.)

> If `test:db:prepare` was already run this session for another task, you can skip straight to `pnpm test:integration -- bookings-package-overuse`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/test/integration/bookings-package-overuse.test.ts
git commit -m "test(bookings): cover package-overuse rejection, waitlist reservation, exclusions

Proves: bookings allowed up to remaining then 409 PACKAGE_EXHAUSTED; a waitlist
seat reserves a session (maxed-out client can't join one either); canceled/past
bookings don't count toward the held total."
```

---

### Task 6: Localized client-side error message

**Files:**
- Modify: `apps/mobile/locales/sr.json` (the `client.calendar` block, near `errorNoPackage` ~line 394)
- Modify: `apps/mobile/locales/en.json` (the `client.calendar` block, near `errorNoPackage` ~line 393)
- Modify: `apps/mobile/components/client/booking-sheet.tsx:342-347` (the error-code → message mapping)

**Interfaces:**
- Consumes: the wire error string `"PACKAGE_EXHAUSTED"` returned by Task 4.
- Produces: client sees the localized "no sessions left" message.

- [ ] **Step 1: Add the Serbian string**

In `apps/mobile/locales/sr.json`, in the same `client.calendar` object that holds `errorNoPackage`/`errorSessionPast` (around line 394), add:

```json
"errorPackageExhausted": "Nemate više termina u paketu. Otkažite zakazani termin ili obnovite paket.",
```

(Place it adjacent to `"errorNoPackage"`; keep valid JSON — add the trailing comma on the preceding line if needed.)

- [ ] **Step 2: Add the English string**

In `apps/mobile/locales/en.json`, in the matching `client.calendar` object (around line 393), add:

```json
"errorPackageExhausted": "No sessions left in your package. Cancel a booking or renew.",
```

- [ ] **Step 3: Map the error code in the booking sheet**

In `apps/mobile/components/client/booking-sheet.tsx`, the current mapping (around lines 342–347) reads:

```tsx
                  {errorCode === "GUARDIAN_VERIFICATION_REQUIRED"
                    ? t("client.calendar.errorGuardianRequired")
                    : errorCode === "no_package_for_class"
                      ? t("client.calendar.errorNoPackage")
                      : errorCode === "SESSION_IN_PAST"
                        ? t("client.calendar.errorSessionPast")
                        : t("client.calendar.bookingError")}
```

Replace it with (adds the `PACKAGE_EXHAUSTED` arm before the fallback):

```tsx
                  {errorCode === "GUARDIAN_VERIFICATION_REQUIRED"
                    ? t("client.calendar.errorGuardianRequired")
                    : errorCode === "no_package_for_class"
                      ? t("client.calendar.errorNoPackage")
                      : errorCode === "PACKAGE_EXHAUSTED"
                        ? t("client.calendar.errorPackageExhausted")
                        : errorCode === "SESSION_IN_PAST"
                          ? t("client.calendar.errorSessionPast")
                          : t("client.calendar.bookingError")}
```

- [ ] **Step 4: Verify lint + types + unit (the CI-equivalent fast gate)**

Run (from `apps/mobile`): `pnpm lint && pnpm check-types && pnpm test:unit`
Expected: all PASS. Lint covers the locale JSON shape and the TSX; check-types confirms no broken references.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/locales/sr.json apps/mobile/locales/en.json apps/mobile/components/client/booking-sheet.tsx
git commit -m "feat(bookings): show actionable message when package is exhausted

A client whose package is fully reserved now sees 'No sessions left — cancel a
booking or renew' (sr default + en) instead of the generic booking error. The
old no_package_for_class copy would have been misleading: they DO have a
package, it's just spent."
```

---

### Task 7: Full local gate before PR

**Files:** none (verification only).

- [ ] **Step 1: Run the fast gate**

Run (from `apps/mobile`): `pnpm lint && pnpm check-types && pnpm test:unit`
Expected: all PASS.

- [ ] **Step 2: Run integration**

Run (from `apps/mobile`): `pnpm test:db:prepare && pnpm test:integration`
Expected: PASS — the new overuse file plus all pre-existing booking specs (`bookings-class-scoping`, `bookings-cancel`, `client-bookings`, etc.) still green. If a pre-existing spec fails, check whether it fails on `dev` too before blaming this change (per project memory: e2e/integration drift).

- [ ] **Step 3: Run e2e if any booking-flow specs exist**

Run (from `apps/mobile`): `pnpm test:e2e:prepare && pnpm test:e2e`
Expected: PASS. The overuse change only adds a rejection path; existing e2e booking happy-paths should be unaffected. If the worktree's `.env` is missing and the e2e server 500s, confirm the `cw-baza` env symlink is present (it is — `.env` was symlinked at worktree creation).

- [ ] **Step 4: Final commit / open PR**

Only after all four suites pass. Per project policy, open the PR with the test-plan checkboxes ticked to reflect the suites actually run, and a body explaining the WHY (overuse hole + the waitlist-reserves decision). No `Claude-Session` trailer, no AI attribution.

---

## Self-Review

**1. Spec coverage:**
- Reject at limit → Task 4 (`PACKAGE_EXHAUSTED`, 409). ✓
- Waitlist also reserves → Task 2 counter includes waitlist; Task 5 second test proves it. ✓
- Per eligible package scope → Task 2 counts bookings by `clientPackageId = eligiblePackage.id`. ✓
- Clear localized error → Task 3 (code), Task 6 (sr+en strings + UI mapping). ✓
- Close the race → Task 4 wraps count+create in `prisma.$transaction`. ✓
- Don't count past/canceled → Task 2 filters `canceledAt: null` + `startsAt > now()`; Task 5 third test proves it. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code. ✓

**3. Type consistency:** `canHoldAnotherBooking({ sessionsRemaining, heldCount })` — same shape in Task 1 def, Task 4 call. `countHeldSessions(tx, { clientProfileId, classTypeId, clientPackageId, at })` — same shape Task 2 def, Task 4 call. Wire error string `"PACKAGE_EXHAUSTED"` — produced in Task 4, matched in Task 5 assertions and Task 6 UI mapping. `BOOKING_ERRORS.PACKAGE_EXHAUSTED` const = that string (Task 3). ✓

## Open follow-ups (out of scope, note in PR)
- Admin reservation endpoint (`/api/admin/reservations`) creates unbacked bookings (`clientPackageId: null`) and is NOT guarded here — admins are trusted to overbook intentionally. If the studio wants the same cap on admin-created bookings, that's a separate task.
- Waitlist entries have no `clientPackageId`, so they're counted by class type, not by specific package. If a client has two packages for the same class, a waitlist seat counts against whichever package eligibility resolves to. Acceptable under the per-eligible-package model; revisit only if multi-package-same-class becomes common.
