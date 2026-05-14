# Client Date of Birth Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture, store, edit, and display each Client's optional date of birth, so a future birthday-gift feature (PR 3) can read it. No reward flow, no cron, no notifications in this PR — DOB plumbing only.

**Architecture:** A nullable `dateOfBirth` column on `ClientProfile` typed as Postgres `DATE` (civil date, no timezone). Admins capture it when sending an invite, edit it on the admin client-detail screen, and see it rendered as a localized `dd.MM.yyyy` row in the client header. Trainers see DOB read-only on shared client views (they're already linkage-scoped). Clients neither see nor edit their own DOB in this PR (deferred — separate UX call).

**Tech Stack:** Prisma (migrate dev), Postgres (`@db.Date`), Zod (`@baza/types`), Expo Router API routes, React Native + Tamagui, Vitest integration tests against real DB.

**Scope decisions locked from grilling session:**
- DOB lives on `ClientProfile`, not `User`.
- Full date (`YYYY-MM-DD`), stored as `@db.Date` — no time, no timezone.
- Nullable everywhere — existing clients have no DOB and stay valid.
- Trainers can read but not edit DOB (matches existing `notes` vs `fullName/phone/isActive` split: trainers edit `notes` only).
- Display format is `dd.MM.yyyy` (Serbian convention).
- Date picker UI: native `@react-native-community/datetimepicker` if already present in the project; otherwise a plain `Input` with a Zod-validated `YYYY-MM-DD` mask. Step 1 verifies which.

---

## File Structure

**Schema & generated code:**
- Modify: `apps/mobile/prisma/schema.prisma` — add `dateOfBirth DateTime? @db.Date` to `ClientProfile`.
- Generate: `apps/mobile/prisma/migrations/<timestamp>_add_client_date_of_birth/migration.sql` — produced by `prisma migrate dev`.
- Regenerate: `apps/mobile/generated/prisma/**` — produced by `prisma generate`.
- Regenerate: `packages/types/src/generated/prisma-zod/**` — produced by the zod-schema generation step in the build pipeline.

**Shared schemas (`@baza/types`):**
- Modify: `packages/types/src/index.ts` — extend `inviteClientInputSchema` with optional `dateOfBirth`; add `updateClientInputSchema` if it doesn't already exist as a named export (currently the PATCH body is ad-hoc — we'll formalize it for safety).

**API routes:**
- Modify: `apps/mobile/app/api/invites/+api.ts` — accept `dateOfBirth` on POST; not persisted on `UserInvite` (invite stays minimal) but instead **buffered** on the invite and applied on invite completion. See Task 5.
- Modify: `apps/mobile/prisma/schema.prisma` (UserInvite) — add `dateOfBirth DateTime? @db.Date` to `UserInvite` too, so the invite-create flow can capture it before the User/ClientProfile exist.
- Modify: `apps/mobile/app/api/auth/complete-invite/+api.ts` — propagate the buffered `dateOfBirth` from the invite into the freshly-created `ClientProfile`.
- Modify: `apps/mobile/app/api/clients/[id]/+api.ts` — return `dateOfBirth` on GET; accept `dateOfBirth` on PATCH (admin only).

**Mobile UI:**
- Modify: `apps/mobile/app/(admin)/klijenti/index.tsx` — add DOB input to invite sheet and edit-client sheet.
- Modify: `apps/mobile/components/admin/client-detail.tsx` — render DOB row in header info section and add DOB input to edit sheet.
- Modify: `apps/mobile/locales/sr.json` — add new i18n keys.
- Modify: `apps/mobile/locales/en.json` — add same keys with English copy.
- Create (only if no shared date helper exists yet): `apps/mobile/lib/date-of-birth.ts` — `parseDateOfBirth(input: string): Date | null` and `formatDateOfBirth(d: Date | null, locale: 'sr'|'en'): string` using `dd.MM.yyyy` for `sr` and `MMM d, yyyy` for `en`.

**Tests:**
- Modify: `apps/mobile/test/integration/invites.test.ts` — assert `dateOfBirth` round-trips through invite → complete-invite → ClientProfile.
- Create: `apps/mobile/test/integration/client-dob.test.ts` — full lifecycle covering admin PATCH, trainer 403 on dateOfBirth field, invalid date rejection, null clearing.
- Create: `apps/mobile/test/unit/date-of-birth.test.ts` — `parseDateOfBirth` / `formatDateOfBirth` round-trips, invalid inputs, year-2000-bug guard, locale-specific formatting.

**Seed:**
- Modify: `apps/mobile/scripts/test/seed-e2e.ts` — give 2 of the 6 seeded clients a `dateOfBirth` (one whose birthday is the anchor day, one whose isn't) so future birthday-cron tests have known fixtures.

**Docs:**
- Already modified in this branch: `CONTEXT.md` (Client entry now mentions `dateOfBirth`).
- No ADR needed for DOB capture itself — placement on ClientProfile vs User is a low-stakes call. The ADR-worthy decision ("birthday gift reuses Poklon paket flow via `isBirthdayGift` flag") lands with PR 3.

---

## Task 1: Verify project context (no code yet)

**Files:** none

- [ ] **Step 1: Confirm the worktree path and branch**

Run from `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat-birthdays/`:
```bash
git rev-parse --abbrev-ref HEAD
git status --short
```
Expected: branch `feat/client-dob-capture`; only `CONTEXT.md` modified.

- [ ] **Step 2: Confirm Postgres is up locally**

```bash
pnpm --filter mobile prisma migrate status
```
Expected: prints current migrations; no schema drift warning. If it errors with "can't reach database", start `docker-compose up -d` first.

- [ ] **Step 3: Confirm a working baseline by running existing integration tests**

```bash
pnpm --filter mobile test:integration -- invites.test.ts
```
Expected: all tests pass (this is the file we'll extend in Task 5).

- [ ] **Step 4: Check whether the project already depends on `@react-native-community/datetimepicker` or a date picker**

```bash
grep -l "datetimepicker\|DatePicker\|date-picker" /Users/stevanborus/Desktop/baza-app/apps/mobile/package.json
grep -rn "DatePickerIOS\|DateTimePicker\|datetimepicker" /Users/stevanborus/Desktop/baza-app/apps/mobile/components 2>/dev/null | head -5
```
Expected output drives Task 8: if any match → reuse it; if no match → use plain `Input` with `YYYY-MM-DD` text mask and Zod validation. **Do not add a new dependency in this PR** — keep it small.

---

## Task 2: Schema migration — add `dateOfBirth` to `ClientProfile` and `UserInvite`

**Files:**
- Modify: `apps/mobile/prisma/schema.prisma`
- Create: `apps/mobile/prisma/migrations/<timestamp>_add_client_date_of_birth/migration.sql` (generated)

- [ ] **Step 1: Edit the schema**

In `apps/mobile/prisma/schema.prisma`, find the `ClientProfile` model and add `dateOfBirth` after `notes`:

```prisma
model ClientProfile {
  id                  String   @id @default(uuid())
  userId              String   @unique
  notes               String?
  dateOfBirth         DateTime? @db.Date
  activePackageStatus String?
  // ... rest unchanged
}
```

And in the `UserInvite` model, add it after `phone`:

```prisma
model UserInvite {
  id             String      @id @default(uuid())
  email          String
  fullName       String
  phone          String?
  dateOfBirth    DateTime?   @db.Date
  // ... rest unchanged
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter mobile prisma migrate dev --name add_client_date_of_birth
```
Expected: creates a new migration directory, applies it locally, regenerates the Prisma client. **Per project rule (AGENTS.md):** never `prisma db push`.

- [ ] **Step 3: Verify the generated SQL**

Open the new file under `apps/mobile/prisma/migrations/<timestamp>_add_client_date_of_birth/migration.sql`. It should contain two `ALTER TABLE` statements:

```sql
ALTER TABLE "ClientProfile" ADD COLUMN "dateOfBirth" DATE;
ALTER TABLE "UserInvite" ADD COLUMN "dateOfBirth" DATE;
```

If it added anything else (e.g., NOT NULL, default, index changes), undo by editing the SQL file and re-running `prisma migrate reset` then `prisma migrate dev` — the columns must be nullable with no default.

- [ ] **Step 4: Regenerate `@baza/types` Zod schemas**

```bash
pnpm --filter @baza/types build
# or whichever script regenerates from Prisma — check packages/types/package.json
```
Expected: `packages/types/src/generated/prisma-zod/schemas/objects/ClientProfileSelect.schema.ts` and `UserInvite.result.ts` now reference `dateOfBirth`. If the build script doesn't auto-regenerate, check `packages/types/README.md` or `package.json` scripts for the right command.

- [ ] **Step 5: Type-check the whole app**

```bash
pnpm --filter mobile check-types
```
Expected: passes. (No code uses `dateOfBirth` yet, so this only proves the schema regen produced valid types.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/prisma/schema.prisma apps/mobile/prisma/migrations packages/types/src/generated
git commit -m "$(cat <<'EOF'
feat(schema): add optional dateOfBirth to ClientProfile and UserInvite

Civil-date column (`DATE`, no timezone) on both ClientProfile and
UserInvite so admins can capture birthdays at invite time and surface
them on the client profile later. Nullable so existing clients stay
valid; a follow-up PR (birthday gift flow) will read this column.
EOF
)"
```

---

## Task 3: Date helper module + unit tests

**Files:**
- Create: `apps/mobile/lib/date-of-birth.ts`
- Create: `apps/mobile/test/unit/date-of-birth.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `apps/mobile/test/unit/date-of-birth.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatDateOfBirth, parseDateOfBirth } from "@/lib/date-of-birth";

describe("parseDateOfBirth", () => {
  it("parses a valid YYYY-MM-DD string into a UTC-midnight Date", () => {
    const d = parseDateOfBirth("1990-05-14");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("1990-05-14T00:00:00.000Z");
  });

  it("returns null for an empty string", () => {
    expect(parseDateOfBirth("")).toBeNull();
  });

  it("returns null for an invalid date (e.g. Feb 30)", () => {
    expect(parseDateOfBirth("1990-02-30")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseDateOfBirth("14/05/1990")).toBeNull();
    expect(parseDateOfBirth("not-a-date")).toBeNull();
  });

  it("rejects years before 1900 and after the current year", () => {
    expect(parseDateOfBirth("1899-12-31")).toBeNull();
    expect(parseDateOfBirth("3000-01-01")).toBeNull();
  });

  it("accepts a Feb 29 in a leap year", () => {
    const d = parseDateOfBirth("2000-02-29");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2000-02-29T00:00:00.000Z");
  });
});

describe("formatDateOfBirth", () => {
  it("formats Serbian as dd.MM.yyyy.", () => {
    const d = new Date("1990-05-14T00:00:00.000Z");
    expect(formatDateOfBirth(d, "sr")).toBe("14.05.1990.");
  });

  it("formats English as 'May 14, 1990'", () => {
    const d = new Date("1990-05-14T00:00:00.000Z");
    expect(formatDateOfBirth(d, "en")).toBe("May 14, 1990");
  });

  it("returns an empty string for null", () => {
    expect(formatDateOfBirth(null, "sr")).toBe("");
    expect(formatDateOfBirth(null, "en")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter mobile test:unit -- date-of-birth.test.ts
```
Expected: all tests FAIL with `Cannot find module '@/lib/date-of-birth'`.

- [ ] **Step 3: Implement the helper**

Create `apps/mobile/lib/date-of-birth.ts`:

```typescript
import { now } from "@/lib/now";

export function parseDateOfBirth(input: string): Date | null {
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;

  const [year, month, day] = input.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));

  // Validate components round-trip (rejects Feb 30, etc.)
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const currentYear = now().getUTCFullYear();
  if (year < 1900 || year > currentYear) return null;

  return d;
}

export function formatDateOfBirth(
  d: Date | null,
  locale: "sr" | "en",
): string {
  if (!d) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();

  if (locale === "sr") return `${day}.${month}.${year}.`;

  const englishMonths = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${englishMonths[d.getUTCMonth()]} ${d.getUTCDate()}, ${year}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter mobile test:unit -- date-of-birth.test.ts
```
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/date-of-birth.ts apps/mobile/test/unit/date-of-birth.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): parseDateOfBirth + formatDateOfBirth helpers

Civil-date parsing/formatting at the boundary so DOB stored as Postgres
DATE round-trips cleanly to the UI. Format follows Serbian convention
(dd.MM.yyyy.) for the sr locale and English month-name format for en.
EOF
)"
```

---

## Task 4: Extend `inviteClientInputSchema` to accept optional DOB

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Read current schema**

Confirm the file still defines `inviteClientInputSchema` (lines 17–25) — it picks `email/fullName/phone` from `UserInviteResultSchema` then extends.

- [ ] **Step 2: Add an exported `dateOfBirthSchema` and extend `inviteClientInputSchema`**

In `packages/types/src/index.ts`, after the `roleSchema` block and before `inviteClientInputSchema`:

```typescript
/**
 * Civil-date YYYY-MM-DD string. Server casts to Postgres DATE; UI formats
 * for display via `formatDateOfBirth`. Empty string is treated as absent
 * by the API routes (translated to null before persisting).
 */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine(
    (s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d &&
        y >= 1900 &&
        y <= new Date().getUTCFullYear()
      );
    },
    { message: "Not a valid calendar date" },
  );
```

Then change the existing `inviteClientInputSchema` to include the optional field:

```typescript
export const inviteClientInputSchema = UserInviteResultSchema.pick({
  email: true,
  fullName: true,
  phone: true,
}).extend({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(6).max(30).optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
});
export type InviteClientInput = z.infer<typeof inviteClientInputSchema>;
```

Also add a new exported schema used by the admin client PATCH:

```typescript
export const updateClientInputSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().min(6).max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  dateOfBirth: dateOfBirthSchema.nullable().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter mobile check-types
```
Expected: passes. (`InviteClientInput` now has `dateOfBirth?: string` which is structurally compatible everywhere it's currently used.)

- [ ] **Step 4: Lint**

```bash
pnpm lint
```
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "$(cat <<'EOF'
feat(types): optional dateOfBirth on invite + update client schemas

Civil-date validation as a reusable Zod schema (YYYY-MM-DD regex +
calendar-date refinement + 1900..current-year bounds). Adds
updateClientInputSchema as a typed analog of the ad-hoc PATCH body so
admin client edits go through one validated surface.
EOF
)"
```

---

## Task 5: Invite API — buffer DOB on UserInvite, hand off on complete-invite

**Files:**
- Modify: `apps/mobile/app/api/invites/+api.ts`
- Modify: `apps/mobile/app/api/auth/complete-invite/+api.ts`
- Modify: `apps/mobile/test/integration/invites.test.ts`

- [ ] **Step 1: Write the failing integration test**

In `apps/mobile/test/integration/invites.test.ts`, add a new test inside the existing `describe("invites API", ...)` block:

```typescript
it("POST /api/invites with dateOfBirth buffers it and hands it off on complete-invite", async () => {
  await seedAdmin();
  const inviteRes = await POST_INVITE(
    inviteRequest({
      email: "dob@test.local",
      fullName: "DOB Client",
      phone: "+381601234567",
      dateOfBirth: "1990-05-14",
    }),
  );
  expect(inviteRes.status).toBe(200);

  const invite = await prisma.userInvite.findFirst({
    where: { email: "dob@test.local" },
    select: { id: true, dateOfBirth: true, tokenHash: true },
  });
  expect(invite).not.toBeNull();
  expect(invite!.dateOfBirth?.toISOString().slice(0, 10)).toBe("1990-05-14");

  // Issue a fresh raw token tied to the same hashed token in the DB.
  // (sendInviteEmailMock recorded the original raw token in args.)
  const sentArgs = sendInviteEmailMock.mock.calls[0][0];
  const rawToken = sentArgs.inviteToken;

  const completeRes = await POST_COMPLETE(
    new Request("http://test.local/api/auth/complete-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "secret12345" }),
    }),
  );
  expect(completeRes.status).toBe(200);

  const profile = await prisma.clientProfile.findFirst({
    where: { user: { email: "dob@test.local" } },
    select: { dateOfBirth: true },
  });
  expect(profile).not.toBeNull();
  expect(profile!.dateOfBirth?.toISOString().slice(0, 10)).toBe("1990-05-14");
});

it("POST /api/invites rejects an invalid dateOfBirth", async () => {
  await seedAdmin();
  const res = await POST_INVITE(
    inviteRequest({
      email: "bad@test.local",
      fullName: "Bad DOB",
      dateOfBirth: "1990-02-30",
    }),
  );
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the new tests, confirm they fail**

```bash
pnpm --filter mobile test:integration -- invites.test.ts
```
Expected: the two new tests FAIL — the first because `dateOfBirth` is dropped silently from the POST body and the column is `null`; the second because the current schema doesn't validate `dateOfBirth` at all (so an invalid value passes Zod and would only fail at the Prisma layer with a different error).

- [ ] **Step 3: Update the invite POST to persist `dateOfBirth`**

In `apps/mobile/app/api/invites/+api.ts`, locate the body destructure (line ~48) and the `prisma.userInvite.create` call (line ~64). Change:

```typescript
const { email, fullName, phone } = parsed.data;
```
to:
```typescript
const { email, fullName, phone, dateOfBirth } = parsed.data;
```

And inside `prisma.userInvite.create({ data: { ... } })`, add the new column:

```typescript
const invite = await prisma.userInvite.create({
  data: {
    email: normalizedEmail,
    fullName,
    phone,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    role: UserRole.CLIENT,
    tokenHash,
    expiresAt,
    createdById: guard.user.id,
  },
  // ...
});
```

- [ ] **Step 4: Update complete-invite to propagate `dateOfBirth` onto the ClientProfile**

Open `apps/mobile/app/api/auth/complete-invite/+api.ts`. Find where it creates the `ClientProfile` (or where it `update`s the existing one) for the new user. Add `dateOfBirth: invite.dateOfBirth` to that creation block. Concrete shape — find the `prisma.user.create` (or similar) call that creates the profile and ensure:

```typescript
const profile = await prisma.clientProfile.create({
  data: {
    userId: user.id,
    dateOfBirth: invite.dateOfBirth,
  },
});
```

If the file already wraps the user+profile creation in a `prisma.$transaction`, keep the change inside the transaction. Also ensure `invite` is selected with `dateOfBirth: true` if it uses an explicit `select`.

- [ ] **Step 5: Run the integration tests**

```bash
pnpm --filter mobile test:integration -- invites.test.ts
```
Expected: all tests pass, including the two new DOB tests and all pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/api/invites/+api.ts apps/mobile/app/api/auth/complete-invite/+api.ts apps/mobile/test/integration/invites.test.ts
git commit -m "$(cat <<'EOF'
feat(invites): buffer DOB on UserInvite, copy onto ClientProfile on completion

Admin can capture DOB at invite time without the Client existing yet.
The invite carries it forward to the ClientProfile created at
complete-invite, so the field is populated the moment the Client signs
in for the first time.
EOF
)"
```

---

## Task 6: Admin client API — return and accept `dateOfBirth`

**Files:**
- Modify: `apps/mobile/app/api/clients/[id]/+api.ts`
- Create: `apps/mobile/test/integration/client-dob.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/mobile/test/integration/client-dob.test.ts`:

```typescript
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

import { GET, PATCH } from "@/app/api/clients/[id]/+api";
import { prisma } from "@/lib/server/prisma";

function patchRequest(body: unknown) {
  return new Request("http://test.local/api/clients/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedAdminAndClient() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  setMockUser({
    id: admin.id, role: "ADMIN", email: admin.email, isActive: true,
    clientProfile: null,
  });
  const clientUser = await prisma.user.create({
    data: {
      email: "client@test.local",
      fullName: "Client X",
      role: "CLIENT",
      clientProfile: { create: { dateOfBirth: new Date("1990-05-14T00:00:00.000Z") } },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  return { admin, clientUserId: clientUser.id, clientProfileId: clientUser.clientProfile!.id };
}

describe("clients/[id] API — dateOfBirth", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET returns dateOfBirth as an ISO date string", async () => {
    const { clientUserId } = await seedAdminAndClient();
    const res = await GET(new Request("http://test.local"), { id: clientUserId });
    const json = (await res.json()) as { client: { dateOfBirth: string | null } };
    expect(res.status).toBe(200);
    expect(json.client.dateOfBirth).toBe("1990-05-14");
  });

  it("PATCH sets dateOfBirth from a YYYY-MM-DD string", async () => {
    const { clientUserId, clientProfileId } = await seedAdminAndClient();
    const res = await PATCH(patchRequest({ dateOfBirth: "1985-12-25" }), { id: clientUserId });
    expect(res.status).toBe(200);
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { dateOfBirth: true },
    });
    expect(profile!.dateOfBirth!.toISOString().slice(0, 10)).toBe("1985-12-25");
  });

  it("PATCH clears dateOfBirth when given null", async () => {
    const { clientUserId, clientProfileId } = await seedAdminAndClient();
    const res = await PATCH(patchRequest({ dateOfBirth: null }), { id: clientUserId });
    expect(res.status).toBe(200);
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { dateOfBirth: true },
    });
    expect(profile!.dateOfBirth).toBeNull();
  });

  it("PATCH rejects an invalid dateOfBirth", async () => {
    const { clientUserId } = await seedAdminAndClient();
    const res = await PATCH(patchRequest({ dateOfBirth: "1990-13-40" }), { id: clientUserId });
    expect(res.status).toBe(400);
  });

  it("Trainer PATCH on dateOfBirth returns 403", async () => {
    const { clientUserId, clientProfileId } = await seedAdminAndClient();
    // Replace mock with a trainer linked to this client.
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", fullName: "T", role: "TRAINER" },
    });
    setMockUser({
      id: trainer.id, role: "TRAINER", email: trainer.email, isActive: true,
      clientProfile: null,
    });
    // Link the trainer via a booking so the trainer-scope check passes.
    // (Existing setup helpers in test/integration already do this for other tests;
    //  if a helper exists, call it; otherwise create the minimal Session + Booking inline.)
    // For this test we don't need the linkage to succeed — we want a 403 from
    // the "trainers can't edit non-notes fields" guard BEFORE the linkage check
    // runs, OR after. Either path returns 403; assert that.
    const res = await PATCH(patchRequest({ dateOfBirth: "1990-05-14" }), { id: clientUserId });
    expect(res.status).toBe(403);
    // DOB unchanged.
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { dateOfBirth: true },
    });
    expect(profile!.dateOfBirth!.toISOString().slice(0, 10)).toBe("1990-05-14");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
pnpm --filter mobile test:integration -- client-dob.test.ts
```
Expected: all 5 tests FAIL (the route currently neither reads nor writes `dateOfBirth`).

- [ ] **Step 3: Update GET to select and return `dateOfBirth`**

In `apps/mobile/app/api/clients/[id]/+api.ts`, the GET selector around lines 21–45 needs `dateOfBirth: true` added to the `clientProfile` top-level select:

```typescript
const clientProfile = await prisma.clientProfile.findUnique({
  where: { userId: id },
  select: {
    id: true,
    notes: true,
    dateOfBirth: true,
    // ...
  },
});
```

And in the response shaping (lines 83–91), include the formatted `dateOfBirth` as a `YYYY-MM-DD` string (since Postgres `DATE` returns a `Date` object pointing at UTC midnight, slice the ISO):

```typescript
return ok({
  success: true,
  client: {
    id: clientProfile.id,
    notes: clientProfile.notes,
    dateOfBirth: clientProfile.dateOfBirth
      ? clientProfile.dateOfBirth.toISOString().slice(0, 10)
      : null,
    packageStatus,
    user: clientProfile.user,
  },
});
```

- [ ] **Step 4: Update PATCH to validate and persist `dateOfBirth`**

Replace the ad-hoc `body` destructure (lines 98–104) with the validated schema:

```typescript
import { updateClientInputSchema } from "@baza/types";
// ...
const bodyResult = await tryCatch(request.json());
const raw = bodyResult.error ? null : bodyResult.data;
const parsed = updateClientInputSchema.safeParse(raw);
if (!parsed.success) return fail("Invalid payload", 400, parsed.error);
const body = parsed.data;
```

Update the trainer-restriction check (line 122) to reject any field that's not `notes`:

```typescript
if (guard.user.role === UserRole.TRAINER) {
  const canAccessClient = await trainerLinkedToClientProfile(guard.user.id, existingClient.id);
  if (!canAccessClient) return fail("Forbidden", 403);

  if (
    body.fullName !== undefined ||
    body.phone !== undefined ||
    body.isActive !== undefined ||
    body.dateOfBirth !== undefined
  ) {
    return fail("Trainers can only update client notes", 403);
  }
}
```

Update the `prisma.user.update` `data` block (lines 132–139) so the `clientProfile.update` carries both `notes` and `dateOfBirth` when present:

```typescript
const clientProfileUpdate: { notes?: string | null; dateOfBirth?: Date | null } = {};
if (body.notes !== undefined) clientProfileUpdate.notes = body.notes;
if (body.dateOfBirth !== undefined) {
  clientProfileUpdate.dateOfBirth =
    body.dateOfBirth === null ? null : new Date(body.dateOfBirth);
}

const user = await prisma.user.update({
  where: { id },
  data: {
    fullName: body.fullName,
    phone: body.phone,
    isActive: body.isActive,
    clientProfile: Object.keys(clientProfileUpdate).length
      ? { update: clientProfileUpdate }
      : undefined,
  },
  select: {
    id: true,
    fullName: true,
    email: true,
    phone: true,
    isActive: true,
    clientProfile: {
      select: { id: true, notes: true, dateOfBirth: true },
    },
  },
});
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
pnpm --filter mobile test:integration -- client-dob.test.ts invites.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/api/clients/[id]/+api.ts apps/mobile/test/integration/client-dob.test.ts
git commit -m "$(cat <<'EOF'
feat(api): clients/[id] reads and admin-writes dateOfBirth

GET surfaces dateOfBirth as YYYY-MM-DD. PATCH now goes through
updateClientInputSchema for full validation; trainers continue to be
restricted to notes only (DOB joins the admin-only field set).
EOF
)"
```

---

## Task 7: Add i18n strings

**Files:**
- Modify: `apps/mobile/locales/sr.json`
- Modify: `apps/mobile/locales/en.json`

- [ ] **Step 1: Find the existing `admin.clients` block in each locale file**

Search for an existing key like `admin.clients.placeholderPhone` to locate the right object. Add new keys next to the existing placeholder keys.

- [ ] **Step 2: Add Serbian keys**

In `apps/mobile/locales/sr.json`, inside `admin.clients` (and `admin.clientDetail`):

```json
"placeholderDateOfBirth": "Datum rođenja (GGGG-MM-DD)",
"labelDateOfBirth": "Datum rođenja",
"dateOfBirthEmpty": "Nije unet",
"dateOfBirthInvalid": "Neispravan datum (format: GGGG-MM-DD)"
```

- [ ] **Step 3: Add English keys**

In `apps/mobile/locales/en.json`, the same keys with English values:

```json
"placeholderDateOfBirth": "Date of birth (YYYY-MM-DD)",
"labelDateOfBirth": "Date of birth",
"dateOfBirthEmpty": "Not set",
"dateOfBirthInvalid": "Invalid date (format: YYYY-MM-DD)"
```

- [ ] **Step 4: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/mobile/locales/sr.json'))"
node -e "JSON.parse(require('fs').readFileSync('apps/mobile/locales/en.json'))"
```
Expected: no output (= valid JSON).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/locales/sr.json apps/mobile/locales/en.json
git commit -m "$(cat <<'EOF'
i18n: add dateOfBirth placeholder/label/empty/invalid strings

Serbian uses GGGG-MM-DD (the locale's own ISO mnemonic); English uses
YYYY-MM-DD. Single keypath under admin.clients so both invite and edit
sheets pull from the same source.
EOF
)"
```

---

## Task 8: Admin invite sheet — DOB input

**Files:**
- Modify: `apps/mobile/app/(admin)/klijenti/index.tsx`

- [ ] **Step 1: Extend invite form state**

At line ~180, change:
```typescript
const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", phone: "" });
```
to:
```typescript
const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", phone: "", dateOfBirth: "" });
```

Also update the reset call after a successful invite (around line 201):
```typescript
setInviteForm({ email: "", fullName: "", phone: "", dateOfBirth: "" });
```

- [ ] **Step 2: Add the DOB input to the invite sheet**

In `apps/mobile/app/(admin)/klijenti/index.tsx` around line 793 (the phone Input), append a new Input *after* the phone field:

```tsx
<Input
  testID="invite-create-dob-input"
  placeholder={t("admin.clients.placeholderDateOfBirth")}
  value={inviteForm.dateOfBirth}
  onChangeText={(v) => setInviteForm((s) => ({ ...s, dateOfBirth: v }))}
  autoCapitalize="none"
/>
```

And update the submit's `createInviteMutation.mutate` payload (around line 804) to send `dateOfBirth` if non-empty:

```tsx
onPress={() =>
  createInviteMutation.mutate({
    email: inviteForm.email,
    fullName: inviteForm.fullName,
    phone: inviteForm.phone || undefined,
    dateOfBirth: inviteForm.dateOfBirth || undefined,
  })
}
```

- [ ] **Step 3: Run a type check**

```bash
pnpm --filter mobile check-types
```
Expected: passes. `InviteClientInput` (extended in Task 4) accepts `dateOfBirth?: string`.

- [ ] **Step 4: Verify the dev server renders the new field**

```bash
pnpm --filter mobile dev
```
Open the admin app, tap "Add invite", confirm a fourth input appears under phone with placeholder text from the locale. Submit with an empty DOB (should still work — it's optional). Submit with a malformed DOB ("foo") — expect the request to fail with a `400` (visible as the existing `inviteError` toast).

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(admin\)/klijenti/index.tsx
git commit -m "$(cat <<'EOF'
feat(admin): DOB field in invite-client sheet

Optional input rendered under phone; payload only includes the value
when set, matching the existing optional-phone pattern. Server-side
validation already lands as 400 if the string isn't a valid civil date.
EOF
)"
```

---

## Task 9: Admin client-detail edit sheet — DOB input + header display

**Files:**
- Modify: `apps/mobile/components/admin/client-detail.tsx`

- [ ] **Step 1: Find the file's existing edit form state and shape**

Around line 98 in `client-detail.tsx`:
```typescript
const [editForm, setEditForm] = useState({ fullName: "", phone: "", notes: "", isActive: true });
```
Change to:
```typescript
const [editForm, setEditForm] = useState({ fullName: "", phone: "", notes: "", isActive: true, dateOfBirth: "" });
```

Find the place that hydrates `editForm` from `client` (around line 150):
```typescript
fullName: client.user.fullName,
phone: client.user.phone ?? "",
notes: client.notes ?? "",
```
Add:
```typescript
dateOfBirth: client.dateOfBirth ?? "",
```

(The API returns `dateOfBirth` as `string | null`, already in `YYYY-MM-DD` form per Task 6.)

- [ ] **Step 2: Add the DOB input to the edit sheet**

Find the existing `<SectionLabel>{t("admin.clients.placeholderNotes")}</SectionLabel>` block and add a new section *before* it:

```tsx
<SectionLabel>{t("admin.clients.labelDateOfBirth")}</SectionLabel>
<Input
  testID="edit-client-dob-input"
  placeholder={t("admin.clients.placeholderDateOfBirth")}
  value={editForm.dateOfBirth}
  onChangeText={(v) => setEditForm((s) => ({ ...s, dateOfBirth: v }))}
  autoCapitalize="none"
/>
```

And update the save call (around line 391) to include DOB. Treat empty string as "clear":
```tsx
updateClientMutation.mutate({
  id: showEditClient!,
  fullName: editForm.fullName,
  phone: editForm.phone || undefined,
  notes: editForm.notes || undefined,
  isActive: editForm.isActive,
  dateOfBirth: editForm.dateOfBirth === "" ? null : editForm.dateOfBirth,
})
```

- [ ] **Step 3: Render DOB in the header (read view)**

Find the header block around lines 219–245 (where `client.user.fullName` is rendered, followed by email and phone). Below the phone line, add a DOB line that uses `formatDateOfBirth`:

```tsx
import { formatDateOfBirth, parseDateOfBirth } from "@/lib/date-of-birth";
// ...
{client.dateOfBirth ? (
  <View className="flex-row items-center gap-2">
    <Text className="text-foregroundMuted" style={{ fontSize: 13 }}>
      {t("admin.clients.labelDateOfBirth")}:
    </Text>
    <Text className="text-foreground" style={{ fontSize: 13 }}>
      {formatDateOfBirth(parseDateOfBirth(client.dateOfBirth), i18n.language === "sr" ? "sr" : "en")}
    </Text>
  </View>
) : null}
```

(`i18n` is already imported in this file — confirm by searching for `useTranslation`; if not, add `const { t, i18n } = useTranslation();` to the existing destructure.)

- [ ] **Step 4: Type-check and lint**

```bash
pnpm --filter mobile check-types
pnpm lint
```
Expected: pass. The `client` type has `dateOfBirth: string | null` because the API was updated in Task 6 and `@baza/types` re-exports the inferred result.

- [ ] **Step 5: Smoke test in the dev server**

```bash
pnpm --filter mobile dev
```
- As admin, open a client with a known DOB (use seeded `client.active.reformer@e2e.test` — Task 10 will give it a DOB). Confirm the header shows "Datum rođenja: dd.mm.yyyy." under email/phone.
- Open the edit sheet, change the DOB, save, refresh — confirm the change persisted.
- Clear the field (empty string), save, refresh — confirm DOB no longer renders in the header.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/admin/client-detail.tsx
git commit -m "$(cat <<'EOF'
feat(admin): DOB field in client-detail edit sheet + header readout

Header gains a 'Datum rođenja' row under phone, formatted with the
locale-aware helper. Edit sheet treats empty string as 'clear'
(server receives null) so admins can remove a DOB explicitly.
EOF
)"
```

---

## Task 10: Seed fixture — give two clients a `dateOfBirth`

**Files:**
- Modify: `apps/mobile/scripts/test/seed-e2e.ts`

- [ ] **Step 1: Add DOBs to the `USERS` const**

Edit the `USERS` literal around lines 50–79 to add an optional `dateOfBirth` field on two clients. Pick one whose MM-DD matches the anchor time (`2026-05-11` → use `1990-05-11`) and one that doesn't (use `1985-08-22`):

```typescript
activeReformer: {
  email: "client.active.reformer@e2e.test",
  fullName: "Active Reformer Client",
  role: UserRole.CLIENT,
  dateOfBirth: "1990-05-11", // matches anchor day — birthday fixture for PR3
},
activeEnergy: {
  email: "client.active.energy@e2e.test",
  fullName: "Active Energy Client",
  role: UserRole.CLIENT,
  dateOfBirth: "1985-08-22", // non-anchor-day birthday
},
```

- [ ] **Step 2: Propagate `dateOfBirth` through `seedUser`**

Around line 163, update the function signature:
```typescript
async function seedUser(
  input: { email: string; fullName: string; role: UserRole; dateOfBirth?: string },
  hash: string,
) {
```

And the ClientProfile creation around line 183:
```typescript
if (input.role === UserRole.CLIENT) {
  const profile = await prisma.clientProfile.create({
    data: {
      userId: user.id,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    },
  });
  clientProfileId = profile.id;
}
```

- [ ] **Step 3: Run the seed**

```bash
pnpm --filter mobile prisma migrate reset --force
# this also re-runs the seed if it's wired into the prisma seed step;
# if not, run the seed script directly per the project's convention:
pnpm --filter mobile seed:e2e   # if that script exists; else check package.json
```
Expected: clean DB, seed applies without error.

- [ ] **Step 4: Confirm the seeded data**

```bash
pnpm --filter mobile prisma studio
```
Open the `ClientProfile` table. Confirm `client.active.reformer@e2e.test`'s profile has `dateOfBirth = 1990-05-11`, and `client.active.energy@e2e.test`'s has `1985-08-22`. Other clients should have NULL.

- [ ] **Step 5: Re-run all integration tests against the fresh seed**

```bash
pnpm --filter mobile test:integration
```
Expected: full integration suite passes. (Other tests that count clients or assert on profile shape should be unaffected — DOB is purely additive.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/scripts/test/seed-e2e.ts
git commit -m "$(cat <<'EOF'
test(seed): give two seeded clients a dateOfBirth

active.reformer is born 1990-05-11 (matches the anchor day so future
birthday-cron tests in PR3 land on a known fixture); active.energy is
born 1985-08-22 (non-anchor-day baseline). The other four stay NULL,
preserving the no-DOB case in the matrix.
EOF
)"
```

---

## Task 11: E2E happy-path — admin invites a client with DOB, sees it on the detail screen

**Files:**
- Create: `apps/mobile/test/e2e/admin-client-dob.spec.ts`

- [ ] **Step 1: Open an existing admin e2e spec as a template**

Pick an existing one such as `apps/mobile/test/e2e/admin-clients.spec.ts` (or any spec that creates an invite). Read its top-of-file imports, fixture, and the `test.beforeEach` block — copy that pattern verbatim into the new file.

- [ ] **Step 2: Write the spec**

Create `apps/mobile/test/e2e/admin-client-dob.spec.ts`. Replace the `// COPIED IMPORTS / FIXTURES` placeholder by lifting the actual imports/fixtures from the template spec:

```typescript
// COPIED IMPORTS / FIXTURES from the template e2e spec — keep identical.

test("admin can invite a client with DOB and see it on the detail screen after completion", async ({ page }) => {
  // The seed already gives client.active.reformer DOB 1990-05-11.
  // Verify it renders on the admin detail screen.
  await page.goto("/klijenti");
  await page.getByText("Active Reformer Client").click();
  // testID convention: 'client-detail-dob' if added; else assert by visible text.
  await expect(page.getByText("11.05.1990.")).toBeVisible();

  // New invite flow — type a DOB, submit, verify the resulting UserInvite row.
  await page.getByTestId("admin-new-invite-button").click();
  await page.getByTestId("invite-create-email-input").fill("e2e-dob@test.local");
  await page.getByTestId("invite-create-name-input").fill("E2E DOB Client");
  await page.getByTestId("invite-create-dob-input").fill("1992-07-04");
  await page.getByTestId("invite-create-submit-button").click();

  // Assert the invite tab shows the new pending invite (existing assertion pattern).
  await page.getByRole("tab", { name: /Pozivnice|Invites/ }).click();
  await expect(page.getByText("e2e-dob@test.local")).toBeVisible();
});
```

If `client-detail` doesn't yet have a stable testID for the DOB row, this spec asserts by visible text. That's the project's existing style for other read-only header rows (per CONTEXT.md's e2e convention — testID for interactive elements, text for read-only).

- [ ] **Step 3: Run the spec**

```bash
pnpm --filter mobile test:e2e -- admin-client-dob.spec.ts
```
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/test/e2e/admin-client-dob.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): admin invite with DOB + detail screen displays seeded DOB

Smoke covers the full path: seeded client shows DOB in header, admin
creates an invite with a DOB, and the invite appears in the list.
Catches regressions where DOB gets stripped silently anywhere in the
chain.
EOF
)"
```

---

## Task 12: Final sweep + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Full test suite**

```bash
pnpm --filter mobile test:unit
pnpm --filter mobile test:integration
pnpm --filter mobile test:e2e
pnpm --filter mobile check-types
pnpm lint
```
Expected: all green.

- [ ] **Step 2: Confirm no stray files**

```bash
git status --short
```
Expected: empty (everything committed).

- [ ] **Step 3: Confirm migration is the only schema change**

```bash
git log --oneline dev..HEAD
ls apps/mobile/prisma/migrations | tail -3
```
Expected: ~10 commits since `dev`, one new migration directory. No other migrations were generated incidentally.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/client-dob-capture
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat: capture and display client date of birth" --body "$(cat <<'EOF'
## Summary
- Adds optional `dateOfBirth` to ClientProfile and UserInvite (Postgres `DATE`, nullable).
- Admin invite sheet + client edit sheet gain a DOB input; client-detail header renders the formatted DOB.
- Trainers can read DOB but not edit it (consistent with the existing fullName/phone/isActive trainer restriction).
- Buffered on UserInvite at invite time so admins can capture it before the Client exists; copied onto ClientProfile during complete-invite.
- Foundation for PR 3 (birthday gift flow) which reads this column.

## Test plan
- [x] Unit: `parseDateOfBirth` / `formatDateOfBirth` round-trip and reject invalid inputs.
- [x] Integration: invite POST persists DOB, complete-invite copies it onto ClientProfile, GET /clients/[id] returns it, admin PATCH updates and clears it, trainer PATCH on DOB returns 403.
- [x] E2E: seeded client shows DOB in admin header; admin can create an invite with DOB and see it land in the invites tab.
- [x] `pnpm lint` / `pnpm check-types` clean.
- [x] Migration is additive and nullable — safe to roll back by dropping the columns.
EOF
)"
```

- [ ] **Step 6: Return the PR URL**

Capture the URL printed by `gh pr create`. Done.

---

## Self-review pass

**Spec coverage:**
- DOB captured at invite time → Task 5 ✓
- DOB stored as civil date, no timezone → Task 2 (`@db.Date`) ✓
- Editable on admin client-detail screen → Task 9 ✓
- Visible on admin client-detail screen → Task 9 ✓
- Optional, nullable everywhere → Task 2 + Task 4 ✓
- Trainer read-only on shared client views → Task 6 (PATCH 403 on DOB for trainer) ✓
- Locale-aware display (`dd.MM.yyyy.` sr / English long form) → Task 3 + Task 7 ✓
- Test coverage at every layer (unit, integration, e2e) → Tasks 3, 5, 6, 11 ✓
- Seed fixture updated for PR 3's future use → Task 10 ✓

**Out of scope (deferred to later PRs):**
- Birthday gift flow → PR 3
- `cron:birthdays` → PR 3
- Notification copy ("Srećan rođendan…") → PR 3
- Cancellation notifications → PR 2
- Client-facing DOB display/edit on the (client) profile screen → not part of this spec; revisit if it comes up

**Placeholder scan:** No TBDs, no "add error handling" hand-waves, every code step has the actual code.

**Type consistency:**
- `dateOfBirth: string | null` everywhere in API responses (YYYY-MM-DD).
- `dateOfBirth: Date | null` in DB / Prisma.
- `dateOfBirth: string | undefined` in invite POST payloads (omitted when empty).
- `dateOfBirth: string | null | undefined` in PATCH payloads (undefined = no change, null = clear, string = set).
- These are intentionally distinct and consistent across tasks.
