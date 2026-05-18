# Consent Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **CRITICAL — worktree discipline:** This plan executes on branch `consent-gate` in worktree `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate`. Every subagent prompt MUST require commands to be run with `cd <worktree> && ...` or `git -C <worktree>`. Three prior subagents in the previous session were caught about to commit on `dev`. Every subagent commit step MUST include a pre-commit check (`git -C <worktree> rev-parse --abbrev-ref HEAD` returns `consent-gate`) and a post-commit branch verification. See `feedback_subagent_must_cd_to_worktree.md`.

**Goal:** Extend the already-shipped consent gate with health-intake schema + endpoints, social-media consent stream, profile-sheet "Pravna dokumenta" / "Zdravstveni podaci" sections, an admin health panel, and a booking gate for unverified minors.

**Architecture:** All work lands on `consent-gate` and rides along on PR #32 (do NOT open a separate PR). Same patterns as PR #32: append-only ledger, server-side evidence capture, versioning via `ACTIVE_VERSIONS`, mutation hooks in queries-factory files. Health data sits in its own model `ClientHealthIntake` (separate from `ConsentRecord` because of distinct retention + hard-delete semantics) with a parallel `ConsentRecord(documentKey: health_intake)` row proving legal basis under Art. 17 ZZPL. Social-media consent piggybacks on `ConsentRecord` with `documentKey: social_media`.

**Tech Stack:** Expo Router, Tamagui, Prisma (Postgres), Zod, React Query, oxlint, Playwright. pnpm-monorepo.

---

## Branch + worktree preflight (do this FIRST in the session)

Before any task is dispatched:

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD   # → consent-gate
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate fetch origin
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate log dev..origin/dev --oneline  # if non-empty, rebase before starting
```

Confirmed-baseline (from handoff): last commit on `consent-gate` is `f1437ba`, `dev` had not advanced as of laptop shutdown 2026-05-14.

---

## File Structure (where work lands)

### New files
- `apps/mobile/prisma/migrations/20260515HHMMSS_health_intake_and_social_media/migration.sql` — Prisma-generated; never hand-author.
- `apps/mobile/lib/legal/health-intake-status.ts` — helper `getHealthIntakeStatus(clientProfileId)` returning `{ latest: ClientHealthIntake | null, isWithdrawn: boolean, socialMediaDecided: boolean }`.
- `apps/mobile/lib/server/health-intake.ts` — write helpers (`recordIntake`, `withdrawIntake`) that wrap the prisma transaction (intake row + parallel `ConsentRecord(health_intake)` write; on withdraw: `deleteMany` + `HealthIntakeWithdrawal` audit row).
- `apps/mobile/app/api/health-intake+api.ts` — GET (latest intake) + POST (upsert intake & write consent) + DELETE (withdraw).
- `apps/mobile/app/api/consent/social-media+api.ts` — POST writes `ConsentRecord(social_media)` with the Da/Ne choice.
- `apps/mobile/lib/queries/health-intake-queries-factory.ts` — `healthIntakeQueries.latest()`, `useRecordHealthIntakeMutation()`, `useWithdrawHealthIntakeMutation()`.
- `apps/mobile/components/consent/social-media-question.tsx` — Da/Ne radio card used on `/consent` and inside `ProfileSheet`.
- `apps/mobile/components/consent/health-intake-form.tsx` — six-question intake form with conditional free-text for Q3/Q4 and the Art. 17 consent checkbox.
- `apps/mobile/components/profile/profile-legal-section.tsx` — "Pravna dokumenta" section for `ProfileSheet`.
- `apps/mobile/components/profile/profile-health-section.tsx` — "Zdravstveni podaci" section for `ProfileSheet` (read-only summary + Izmeni + Povuci saglasnost).
- `apps/mobile/components/admin/client-health-panel.tsx` — admin client-detail health flags + intake summary.
- `docs/legal/sr/health-intake-v1.md`, `docs/legal/en/health-intake-v1.md` — the "Saglasan sam da Studio obrađuje..." disclosure text (short; just the Art. 17 boilerplate from the spec).

### Modified files
- `apps/mobile/prisma/schema.prisma` — add `social_media` + `health_intake` to `ConsentDocumentKey` enum; add `ClientHealthIntake` and `HealthIntakeWithdrawal` models; add relations on `User` (for `recordedBy`) and `ClientProfile` (for `healthIntakes`, `healthIntakeWithdrawals`).
- `apps/mobile/lib/legal/versions.ts` — add `social_media: 1` and `health_intake: 1` to `ACTIVE_VERSIONS`. Add a new export `MUST_ANSWER_KEYS_FOR_ROLE` listing `social_media` for `CLIENT` (separate from gate keys because Da-or-Ne is acceptable; only *unanswered* is blocking).
- `apps/mobile/lib/legal/consent-status.ts` — extend `ConsentStatus` with `socialMediaDecided: boolean`; compute it by querying for any `ConsentRecord` with `documentKey: social_media` for the user (latest row determines current state; `undefined` ⇒ undecided).
- `apps/mobile/scripts/generate-legal-bundle.ts` — pick up `health-intake-v1.md` in both locales (no code change required if it globs `*.md`; verify and adjust if not).
- `apps/mobile/app/api/consent/status+api.ts` — pass `socialMediaDecided` through.
- `apps/mobile/app/consent.tsx` — add social-media question card and (for clients) the health-intake card. Gate the "Nastavi" button on social-media decided + (intake answered OR skipped).
- `apps/mobile/app/api/bookings/+api.ts` — in the `BOOK` branch, before persisting the booking, fetch the client's `ConsentStatus` and refuse with `409 GUARDIAN_VERIFICATION_REQUIRED` if `guardianVerificationNeeded === true`.
- `apps/mobile/components/ui/profile-sheet.tsx` — mount the two new section components after the existing language/theme/email rows.
- `apps/mobile/components/admin/client-detail.tsx` (or whichever wraps the Pregled tab) — render `<ClientHealthPanel />` below `<ClientLegalPanel />`.
- `packages/types/src/index.ts` — export `healthIntakeInputSchema`, `healthIntakeResponseSchema`, `socialMediaConsentInputSchema`, the booking-error response shape.
- `apps/mobile/locales/sr.json` and `apps/mobile/locales/en.json` — all `consent.socialMedia*`, `intake.*`, `profile.healthIntake*`, `profile.legalSection`, `admin.client.healthFlags.*`, error-copy strings.

### Test files
- `apps/mobile/test/integration/health-intake-record.test.ts`
- `apps/mobile/test/integration/health-intake-withdraw.test.ts`
- `apps/mobile/test/integration/social-media-consent.test.ts`
- `apps/mobile/test/integration/booking-guardian-gate.test.ts`
- `apps/mobile/test/unit/health-intake-status.test.ts`
- `apps/mobile/test/unit/consent-status-social-media.test.ts`
- `apps/mobile/test/e2e/consent-gate-social-media.spec.ts`
- `apps/mobile/test/e2e/health-intake.spec.ts`
- `apps/mobile/test/e2e/profile-legal-section.spec.ts`
- `apps/mobile/test/e2e/booking-guardian-gate.spec.ts`

---

## Task Ordering Rationale

Schema-first foundation (Task 1) so every downstream task can rely on `ClientHealthIntake` / `HealthIntakeWithdrawal` / new enum values existing. Then **two parallel-ready vertical slices**: (A) social-media (small, fully isolated) and (B) health-intake server (record + withdraw + status). Then the consumer surfaces (consent screen wiring, profile sheet sections, admin panel, booking gate). E2E coverage closes each surface.

A subagent driving this plan should run Task 1 → 2 → 3 alone; the subsequent UI tasks (5-10) can be parallelised in pairs since they touch disjoint files. Booking gate (Task 11) depends only on Task 1's schema and Task 4's `socialMediaDecided` field — does not block other UI work.

---

### Task 1: Prisma schema migration — new models + enum values

**Files:**
- Modify: `apps/mobile/prisma/schema.prisma`
- Create: `apps/mobile/prisma/migrations/20260515HHMMSS_health_intake_and_social_media/migration.sql` (generated by `prisma migrate dev`, do not hand-author — see `feedback_never_hand_author_migrations.md`)

- [ ] **Step 1: Add enum values to `ConsentDocumentKey`**

Edit `apps/mobile/prisma/schema.prisma`, replace the existing enum with:

```prisma
enum ConsentDocumentKey {
  tos
  privacy
  eula
  waiver_adult
  waiver_minor
  social_media
  health_intake
}
```

- [ ] **Step 2: Add `ClientHealthIntake` and `HealthIntakeWithdrawal` models**

Append below `ConsentRecord` in `apps/mobile/prisma/schema.prisma`:

```prisma
model ClientHealthIntake {
  id                 String        @id @default(uuid())
  clientProfileId    String
  clientProfile      ClientProfile @relation(fields: [clientProfileId], references: [id], onDelete: Cascade)
  isPhysicallyActive Boolean
  isFirstPilates     Boolean
  hasComplaints      Boolean
  complaintsDetails  String?
  hasInjuries        Boolean
  injuriesDetails    String?
  isPregnant         Boolean
  isPostpartum       Boolean
  recordedAt         DateTime      @default(now())
  recordedByUserId   String?
  recordedBy         User?         @relation("HealthIntakeRecordedBy", fields: [recordedByUserId], references: [id])
  guardianName       String?
  guardianRelation   String?

  @@index([clientProfileId, recordedAt])
}

model HealthIntakeWithdrawal {
  id              String        @id @default(uuid())
  clientProfileId String
  clientProfile   ClientProfile @relation(fields: [clientProfileId], references: [id], onDelete: Cascade)
  withdrawnAt     DateTime      @default(now())

  @@index([clientProfileId, withdrawnAt])
}
```

- [ ] **Step 3: Add back-relations to `ClientProfile` and `User`**

In `model ClientProfile { ... }`, add (in the relations block, after `trainerNotes`):

```prisma
  healthIntakes           ClientHealthIntake[]
  healthIntakeWithdrawals HealthIntakeWithdrawal[]
```

In `model User { ... }`, add to the existing relations (next to where `GuardianVerifier` is declared on `ConsentRecord` — search for `guardianVerifiedBy`):

```prisma
  healthIntakesRecorded ClientHealthIntake[] @relation("HealthIntakeRecordedBy")
```

- [ ] **Step 4: Run `prisma migrate dev`**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm --filter mobile exec prisma migrate dev --name health_intake_and_social_media
```

Expected: migration created at `apps/mobile/prisma/migrations/<timestamp>_health_intake_and_social_media/migration.sql`; prisma client regenerated. If the command reports drift or fails, STOP — hand the command to the user (see `feedback_never_hand_author_migrations.md`). Never run `prisma migrate diff --script` and hand-author the SQL.

- [ ] **Step 5: Verify generated migration**

Run:
```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate status
```
Expected: one new migration directory + modified `schema.prisma` + modified `generated/` files.

Open the new `migration.sql` and confirm it contains:
- `ALTER TYPE "ConsentDocumentKey" ADD VALUE 'social_media';`
- `ALTER TYPE "ConsentDocumentKey" ADD VALUE 'health_intake';`
- `CREATE TABLE "ClientHealthIntake" (...)`
- `CREATE TABLE "HealthIntakeWithdrawal" (...)`
- Two `CREATE INDEX` statements.

- [ ] **Step 6: Commit**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # must print "consent-gate"
git add apps/mobile/prisma/schema.prisma apps/mobile/prisma/migrations/ apps/mobile/generated/
git commit -m "$(cat <<'EOF'
feat(prisma): ClientHealthIntake, HealthIntakeWithdrawal, social_media + health_intake keys

Health intake lives in its own table because retention semantics differ
from the consent ledger — withdrawal hard-deletes intake rows (Art. 17
ZZPL right-to-erasure) while ConsentRecord stays append-only as proof
the data was collected with consent. Social-media + health-intake are
added as ConsentDocumentKey enum values so the ledger covers them too.
EOF
)"
git log -1 --format='%H %s' consent-gate  # confirm new SHA is on consent-gate
```

---

### Task 2: Extend `ACTIVE_VERSIONS` + new must-answer category

**Files:**
- Modify: `apps/mobile/lib/legal/versions.ts`
- Test: `apps/mobile/test/unit/active-versions.test.ts` (may already exist; check and add if missing)

- [ ] **Step 1: Write failing test for new keys**

Create or extend `apps/mobile/test/unit/active-versions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ACTIVE_VERSIONS, MUST_ANSWER_KEYS_FOR_ROLE } from "@/lib/legal/versions";

describe("ACTIVE_VERSIONS", () => {
  it("registers social_media v1 and health_intake v1", () => {
    expect(ACTIVE_VERSIONS.social_media).toBe(1);
    expect(ACTIVE_VERSIONS.health_intake).toBe(1);
  });
});

describe("MUST_ANSWER_KEYS_FOR_ROLE", () => {
  it("requires CLIENT to answer social_media", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.CLIENT).toContain("social_media");
  });
  it("does not gate ADMIN or TRAINER on social_media", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.ADMIN).toEqual([]);
    expect(MUST_ANSWER_KEYS_FOR_ROLE.TRAINER).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm --filter mobile test:unit -- active-versions
```
Expected: FAIL — properties undefined.

- [ ] **Step 3: Update `apps/mobile/lib/legal/versions.ts`**

Replace the `ACTIVE_VERSIONS` constant and add the new export:

```ts
export const ACTIVE_VERSIONS: Record<ConsentDocumentKey, number> = {
  tos: 1,
  privacy: 1,
  eula: 1,
  waiver_adult: 1,
  waiver_minor: 1,
  social_media: 1,
  health_intake: 1,
};

/**
 * "Must-answer" keys (separate from gate keys). The user must record a
 * choice for these (Da or Ne — both are acceptable answers; only an
 * *undecided* state blocks progression past /consent). Health intake is
 * NOT here because skipping it is allowed (records nothing); only the
 * social-media Da/Ne is non-skippable.
 */
export const MUST_ANSWER_KEYS_FOR_ROLE = {
  ADMIN: [] as const,
  TRAINER: [] as const,
  CLIENT: ["social_media"] as const,
} satisfies Record<"ADMIN" | "TRAINER" | "CLIENT", readonly ConsentDocumentKey[]>;
```

- [ ] **Step 4: Run unit tests, confirm pass**

```bash
pnpm --filter mobile test:unit -- active-versions
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/lib/legal/versions.ts apps/mobile/test/unit/active-versions.test.ts
git commit -m "$(cat <<'EOF'
feat(legal): ACTIVE_VERSIONS adds social_media + health_intake, MUST_ANSWER_KEYS_FOR_ROLE

Social-media is "must-answer" not "must-accept" — Ne is an acceptable
recorded choice and shouldn't gate sign-in indefinitely. Separating
MUST_ANSWER from gate keys keeps the consent-status logic honest about
what each check means.
EOF
)"
```

---

### Task 3: `getConsentStatus` returns `socialMediaDecided`

**Files:**
- Modify: `apps/mobile/lib/legal/consent-status.ts`
- Test: `apps/mobile/test/unit/consent-status-social-media.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/mobile/test/unit/consent-status-social-media.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "@/test/integration/reset-db";
import { prisma } from "@/lib/server/prisma";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { seedClient } from "@/test/integration/seeds";

describe("getConsentStatus — socialMediaDecided", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns false when no social_media record exists", async () => {
    const { user } = await seedClient({ acceptAllGateDocs: true });
    const status = await getConsentStatus(user.id);
    expect(status.socialMediaDecided).toBe(false);
  });

  it("returns true after a Da record", async () => {
    const { user } = await seedClient({ acceptAllGateDocs: true });
    await prisma.consentRecord.create({
      data: {
        userId: user.id,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: true,
      },
    });
    const status = await getConsentStatus(user.id);
    expect(status.socialMediaDecided).toBe(true);
  });

  it("returns true after a Ne record (false is still decided)", async () => {
    const { user } = await seedClient({ acceptAllGateDocs: true });
    await prisma.consentRecord.create({
      data: {
        userId: user.id,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: false,
      },
    });
    const status = await getConsentStatus(user.id);
    expect(status.socialMediaDecided).toBe(true);
  });

  it("does not gate ADMIN/TRAINER on social-media", async () => {
    const { user } = await seedClient({ role: "ADMIN", acceptAllGateDocs: true });
    const status = await getConsentStatus(user.id);
    expect(status.socialMediaDecided).toBe(false); // false but should not block
  });
});
```

(If `seedClient` doesn't accept `role` or `acceptAllGateDocs`, check `apps/mobile/test/integration/seeds.ts` and adapt the test setup to the actual helper signature — the principle of the test stays the same.)

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter mobile test:unit -- consent-status-social-media
```
Expected: FAIL — `socialMediaDecided` undefined on returned object.

- [ ] **Step 3: Update `apps/mobile/lib/legal/consent-status.ts`**

In the `ConsentStatus` type, add `socialMediaDecided: boolean;`. In `getConsentStatus`, after the `latestPerKey` query, add (before the `guardianVerificationNeeded` block):

```ts
const socialMediaRecord = await prisma.consentRecord.findFirst({
  where: { userId, documentKey: "social_media" },
  orderBy: { acceptedAt: "desc" },
  select: { id: true },
});
const socialMediaDecided = socialMediaRecord !== null;
```

And in the returned object, include `socialMediaDecided`.

- [ ] **Step 4: Run tests, confirm pass**

```bash
pnpm --filter mobile test:unit -- consent-status-social-media
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/lib/legal/consent-status.ts apps/mobile/test/unit/consent-status-social-media.test.ts
git commit -m "$(cat <<'EOF'
feat(legal): getConsentStatus surfaces socialMediaDecided

Both Da and Ne count as decided — only an absent record blocks the
gate. Caller (middleware + /consent screen) uses this together with
pending.length to decide whether to redirect.
EOF
)"
```

---

### Task 4: `/api/consent/status` returns the new field

**Files:**
- Modify: `apps/mobile/app/api/consent/status+api.ts`
- Modify: `packages/types/src/index.ts` (or wherever `consentStatusResponseSchema` lives — grep)
- Test: `apps/mobile/test/integration/consent-status.test.ts` (already exists — extend it)

- [ ] **Step 1: Locate the response schema**

```bash
grep -rn "consentStatusResponseSchema" /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate/packages/types/
```

- [ ] **Step 2: Write failing integration test**

In `apps/mobile/test/integration/consent-status.test.ts` add (after existing tests):

```ts
it("returns socialMediaDecided=false for a fresh client", async () => {
  const { user, cookie } = await seedClientWithSession();
  const res = await fetch("http://localhost:3000/api/consent/status", {
    headers: { cookie },
  });
  const body = await res.json();
  expect(body.socialMediaDecided).toBe(false);
});

it("returns socialMediaDecided=true after a recorded Ne", async () => {
  const { user, cookie } = await seedClientWithSession();
  await prisma.consentRecord.create({
    data: {
      userId: user.id,
      documentKey: "social_media",
      version: 1,
      locale: "sr",
      accepted: false,
    },
  });
  const res = await fetch("http://localhost:3000/api/consent/status", {
    headers: { cookie },
  });
  const body = await res.json();
  expect(body.socialMediaDecided).toBe(true);
});
```

- [ ] **Step 3: Run and confirm failure**

```bash
pnpm --filter mobile test:integration -- consent-status
```
Expected: FAIL — `socialMediaDecided` not on response.

- [ ] **Step 4: Update Zod response schema**

In `packages/types/src/index.ts` (or the file from Step 1), add to `consentStatusResponseSchema`:
```ts
socialMediaDecided: z.boolean(),
```

- [ ] **Step 5: Update API route**

In `apps/mobile/app/api/consent/status+api.ts`, ensure the JSON returned includes `socialMediaDecided: status.socialMediaDecided`.

- [ ] **Step 6: Run tests, confirm pass**

```bash
pnpm --filter mobile test:integration -- consent-status
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/app/api/consent/status+api.ts packages/types/src/index.ts apps/mobile/test/integration/consent-status.test.ts
git commit -m "$(cat <<'EOF'
feat(api): /api/consent/status returns socialMediaDecided

Client uses this to enable the consent-screen Nastavi button only after
a recorded choice; admin/trainer surfaces ignore it.
EOF
)"
```

---

### Task 5: `POST /api/consent/social-media` writes a record

**Files:**
- Create: `apps/mobile/app/api/consent/social-media+api.ts`
- Modify: `packages/types/src/index.ts` — add `socialMediaConsentInputSchema`
- Test: `apps/mobile/test/integration/social-media-consent.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/mobile/test/integration/social-media-consent.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./reset-db";
import { seedClientWithSession } from "./seeds";

describe("POST /api/consent/social-media", () => {
  beforeEach(resetDb);

  it("writes a record with accepted=true", async () => {
    const { user, cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/consent/social-media", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    });
    expect(res.status).toBe(200);
    const rec = await prisma.consentRecord.findFirstOrThrow({
      where: { userId: user.id, documentKey: "social_media" },
    });
    expect(rec.accepted).toBe(true);
    expect(rec.version).toBe(1);
  });

  it("writes a record with accepted=false (Ne is valid)", async () => {
    const { user, cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/consent/social-media", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ accepted: false }),
    });
    expect(res.status).toBe(200);
    const rec = await prisma.consentRecord.findFirstOrThrow({
      where: { userId: user.id, documentKey: "social_media" },
    });
    expect(rec.accepted).toBe(false);
  });

  it("captures IP / userAgent server-side, ignoring client values", async () => {
    const { user, cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/consent/social-media", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        "user-agent": "real-agent-1.0",
        "x-forwarded-for": "203.0.113.42",
      },
      body: JSON.stringify({ accepted: true, ipAddress: "fake", userAgent: "fake" }),
    });
    expect(res.status).toBe(200);
    const rec = await prisma.consentRecord.findFirstOrThrow({
      where: { userId: user.id, documentKey: "social_media" },
    });
    expect(rec.ipAddress).toBe("203.0.113.42");
    expect(rec.userAgent).toBe("real-agent-1.0");
  });

  it("each new POST appends — old rows are preserved", async () => {
    const { user, cookie } = await seedClientWithSession();
    await fetch("http://localhost:3000/api/consent/social-media", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    });
    await fetch("http://localhost:3000/api/consent/social-media", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ accepted: false }),
    });
    const rows = await prisma.consentRecord.findMany({
      where: { userId: user.id, documentKey: "social_media" },
      orderBy: { acceptedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].accepted).toBe(true);
    expect(rows[1].accepted).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter mobile test:integration -- social-media-consent
```
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Add Zod schema**

In `packages/types/src/index.ts`:

```ts
export const socialMediaConsentInputSchema = z.object({
  accepted: z.boolean(),
});
export type SocialMediaConsentInput = z.infer<typeof socialMediaConsentInputSchema>;
```

- [ ] **Step 4: Create the route**

`apps/mobile/app/api/consent/social-media+api.ts`:

```ts
import { socialMediaConsentInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { extractEvidence } from "@/lib/legal/evidence";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT, UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const parsed = socialMediaConsentInputSchema.safeParse(
    bodyResult.error ? null : bodyResult.data,
  );
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const evidence = extractEvidence(request);

  const record = await prisma.consentRecord.create({
    data: {
      userId: guard.user.id,
      documentKey: "social_media",
      version: ACTIVE_VERSIONS.social_media,
      locale: guard.user.preferredLocale ?? "sr",
      accepted: parsed.data.accepted,
      ipAddress: evidence.ipAddress,
      userAgent: evidence.userAgent,
      appVersion: evidence.appVersion,
    },
    select: { id: true, accepted: true, acceptedAt: true },
  });

  return ok(record);
}
```

(Verify the exact `requireRole` / `fail` / `ok` import paths by looking at existing routes — `apps/mobile/app/api/consent/accept+api.ts` is the closest template. Mirror that file's style and helpers.)

- [ ] **Step 5: Run tests, confirm pass**

```bash
pnpm --filter mobile test:integration -- social-media-consent
```
Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/app/api/consent/social-media+api.ts packages/types/src/index.ts apps/mobile/test/integration/social-media-consent.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/consent/social-media records Da/Ne choice

Same append-only ledger + server-side evidence as the accept endpoint.
A Ne row is just as legally interesting as a Da row — it's proof we
asked and the user said no.
EOF
)"
```

---

### Task 6: Health-intake server helpers + endpoints (GET / POST / DELETE)

**Files:**
- Create: `apps/mobile/lib/server/health-intake.ts`
- Create: `apps/mobile/app/api/health-intake+api.ts`
- Modify: `packages/types/src/index.ts` — add `healthIntakeInputSchema`, `healthIntakeResponseSchema`
- Test: `apps/mobile/test/integration/health-intake-record.test.ts`
- Test: `apps/mobile/test/integration/health-intake-withdraw.test.ts`
- Create: `docs/legal/sr/health-intake-v1.md`, `docs/legal/en/health-intake-v1.md`

- [ ] **Step 1: Add the legal documents**

`docs/legal/sr/health-intake-v1.md`:

```markdown
# Saglasnost za obradu zdravstvenih podataka

Ovi podaci se koriste isključivo da prilagodimo trening Vašem stanju.
Davanje odgovora je dobrovoljno; ako odlučite da ih ne podelite,
prihvatate da trening ne možemo posebno prilagoditi. Podatke možete
obrisati u svakom trenutku iz svog profila.

Osnov za obradu: Član 17 *Zakona o zaštiti podataka o ličnosti* — Vaša
izričita saglasnost.
```

`docs/legal/en/health-intake-v1.md`:

```markdown
# Consent to process health data

This data is used solely to adapt training to your condition. Providing
answers is voluntary; if you choose not to share them, you accept that
training cannot be specifically adapted. You can delete this data at
any time from your profile.

Legal basis: Article 17 of the *Personal Data Protection Act* — your
explicit consent.
```

- [ ] **Step 2: Regenerate the legal bundle**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm --filter mobile exec tsx apps/mobile/scripts/generate-legal-bundle.ts
```

Expected: the bundle module now contains entries for `health-intake-v1` in both locales. If the script doesn't auto-discover new keys, modify it to include `health_intake` in the same list it uses for the other keys (search for `tos` in that file to find the list).

- [ ] **Step 3: Write failing integration test for record/upsert**

`apps/mobile/test/integration/health-intake-record.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./reset-db";
import { seedClientWithSession } from "./seeds";

const validBody = {
  isPhysicallyActive: true,
  isFirstPilates: true,
  hasComplaints: false,
  hasInjuries: false,
  isPregnant: false,
  isPostpartum: false,
};

describe("POST /api/health-intake", () => {
  beforeEach(resetDb);

  it("creates an intake row + parallel ConsentRecord(health_intake)", async () => {
    const { user, cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);

    const intake = await prisma.clientHealthIntake.findFirstOrThrow({
      where: { clientProfile: { userId: user.id } },
    });
    expect(intake.isPhysicallyActive).toBe(true);

    const consent = await prisma.consentRecord.findFirstOrThrow({
      where: { userId: user.id, documentKey: "health_intake" },
    });
    expect(consent.accepted).toBe(true);
    expect(consent.version).toBe(1);
  });

  it("rejects with 400 when hasComplaints=true but complaintsDetails missing", async () => {
    const { cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, hasComplaints: true }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects with 400 when hasInjuries=true but injuriesDetails missing", async () => {
    const { cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, hasInjuries: true }),
    });
    expect(res.status).toBe(400);
  });

  it("appends — newer row is returned by GET", async () => {
    const { user, cookie } = await seedClientWithSession();
    await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, isPregnant: true }),
    });
    const rows = await prisma.clientHealthIntake.findMany({
      where: { clientProfile: { userId: user.id } },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows).toHaveLength(2);

    const getRes = await fetch("http://localhost:3000/api/health-intake", {
      headers: { cookie },
    });
    const body = await getRes.json();
    expect(body.isPregnant).toBe(true);
  });

  it("GET returns 404 before any intake is recorded", async () => {
    const { cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/health-intake", {
      headers: { cookie },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Write failing withdraw test**

`apps/mobile/test/integration/health-intake-withdraw.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./reset-db";
import { seedClientWithSession } from "./seeds";

const validBody = {
  isPhysicallyActive: true,
  isFirstPilates: true,
  hasComplaints: false,
  hasInjuries: false,
  isPregnant: false,
  isPostpartum: false,
};

describe("DELETE /api/health-intake", () => {
  beforeEach(resetDb);

  it("hard-deletes all intake rows and writes a withdrawal audit row", async () => {
    const { user, cookie } = await seedClientWithSession();
    await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    await fetch("http://localhost:3000/api/health-intake", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const res = await fetch("http://localhost:3000/api/health-intake", {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(200);

    const remainingIntakes = await prisma.clientHealthIntake.count({
      where: { clientProfile: { userId: user.id } },
    });
    expect(remainingIntakes).toBe(0);

    const audits = await prisma.healthIntakeWithdrawal.count({
      where: { clientProfile: { userId: user.id } },
    });
    expect(audits).toBe(1);
  });

  it("is idempotent — DELETE with no intake rows still writes an audit row", async () => {
    const { user, cookie } = await seedClientWithSession();
    const res = await fetch("http://localhost:3000/api/health-intake", {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const audits = await prisma.healthIntakeWithdrawal.count({
      where: { clientProfile: { userId: user.id } },
    });
    expect(audits).toBe(1);
  });
});
```

- [ ] **Step 5: Run failing tests**

```bash
pnpm --filter mobile test:integration -- health-intake
```
Expected: FAIL — route missing.

- [ ] **Step 6: Implement the Zod schemas**

In `packages/types/src/index.ts`:

```ts
export const healthIntakeInputSchema = z
  .object({
    isPhysicallyActive: z.boolean(),
    isFirstPilates: z.boolean(),
    hasComplaints: z.boolean(),
    complaintsDetails: z.string().min(1).max(2000).optional(),
    hasInjuries: z.boolean(),
    injuriesDetails: z.string().min(1).max(2000).optional(),
    isPregnant: z.boolean(),
    isPostpartum: z.boolean(),
    guardianName: z.string().min(1).max(120).optional(),
    guardianRelation: z.enum(["roditelj", "staratelj"]).optional(),
  })
  .refine((d) => !d.hasComplaints || (d.complaintsDetails?.length ?? 0) > 0, {
    message: "complaintsDetails required when hasComplaints is true",
    path: ["complaintsDetails"],
  })
  .refine((d) => !d.hasInjuries || (d.injuriesDetails?.length ?? 0) > 0, {
    message: "injuriesDetails required when hasInjuries is true",
    path: ["injuriesDetails"],
  });
export type HealthIntakeInput = z.infer<typeof healthIntakeInputSchema>;

export const healthIntakeResponseSchema = z.object({
  id: z.string(),
  isPhysicallyActive: z.boolean(),
  isFirstPilates: z.boolean(),
  hasComplaints: z.boolean(),
  complaintsDetails: z.string().nullable(),
  hasInjuries: z.boolean(),
  injuriesDetails: z.string().nullable(),
  isPregnant: z.boolean(),
  isPostpartum: z.boolean(),
  recordedAt: z.string(),
  guardianName: z.string().nullable(),
  guardianRelation: z.string().nullable(),
});
export type HealthIntakeResponse = z.infer<typeof healthIntakeResponseSchema>;
```

- [ ] **Step 7: Implement server helpers**

`apps/mobile/lib/server/health-intake.ts`:

```ts
import type { Prisma } from "@/generated/prisma";
import { extractEvidence } from "@/lib/legal/evidence";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { prisma } from "./prisma";
import type { HealthIntakeInput } from "@baza/types";

type RecordIntakeArgs = {
  userId: string;
  clientProfileId: string;
  locale: "sr" | "en";
  input: HealthIntakeInput;
  evidence: ReturnType<typeof extractEvidence>;
  recordedByUserId?: string | null; // null = self-recorded
};

export async function recordIntake(args: RecordIntakeArgs) {
  return prisma.$transaction(async (tx) => {
    const intake = await tx.clientHealthIntake.create({
      data: {
        clientProfileId: args.clientProfileId,
        isPhysicallyActive: args.input.isPhysicallyActive,
        isFirstPilates: args.input.isFirstPilates,
        hasComplaints: args.input.hasComplaints,
        complaintsDetails: args.input.complaintsDetails ?? null,
        hasInjuries: args.input.hasInjuries,
        injuriesDetails: args.input.injuriesDetails ?? null,
        isPregnant: args.input.isPregnant,
        isPostpartum: args.input.isPostpartum,
        guardianName: args.input.guardianName ?? null,
        guardianRelation: args.input.guardianRelation ?? null,
        recordedByUserId: args.recordedByUserId ?? null,
      },
    });
    await tx.consentRecord.create({
      data: {
        userId: args.userId,
        documentKey: "health_intake",
        version: ACTIVE_VERSIONS.health_intake,
        locale: args.locale,
        accepted: true,
        ipAddress: args.evidence.ipAddress,
        userAgent: args.evidence.userAgent,
        appVersion: args.evidence.appVersion,
      },
    });
    return intake;
  });
}

export async function withdrawIntake(clientProfileId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.clientHealthIntake.deleteMany({ where: { clientProfileId } });
    const audit = await tx.healthIntakeWithdrawal.create({
      data: { clientProfileId },
    });
    return audit;
  });
}

export async function latestIntake(clientProfileId: string) {
  return prisma.clientHealthIntake.findFirst({
    where: { clientProfileId },
    orderBy: { recordedAt: "desc" },
  });
}
```

- [ ] **Step 8: Implement the API route**

`apps/mobile/app/api/health-intake+api.ts`:

```ts
import { healthIntakeInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { extractEvidence } from "@/lib/legal/evidence";
import { latestIntake, recordIntake, withdrawIntake } from "@/lib/server/health-intake";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const row = await latestIntake(clientProfileId);
  if (!row) return fail("No intake recorded", 404);
  return ok(row);
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const bodyResult = await tryCatch(request.json());
  const parsed = healthIntakeInputSchema.safeParse(
    bodyResult.error ? null : bodyResult.data,
  );
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const intake = await recordIntake({
    userId: guard.user.id,
    clientProfileId,
    locale: guard.user.preferredLocale ?? "sr",
    input: parsed.data,
    evidence: extractEvidence(request),
  });
  return ok(intake);
}

export async function DELETE(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const audit = await withdrawIntake(clientProfileId);
  return ok(audit);
}
```

- [ ] **Step 9: Run tests, confirm pass**

```bash
pnpm --filter mobile test:integration -- health-intake
```
Expected: PASS (all tests in both new files).

- [ ] **Step 10: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/lib/server/health-intake.ts apps/mobile/app/api/health-intake+api.ts packages/types/src/index.ts apps/mobile/test/integration/health-intake-record.test.ts apps/mobile/test/integration/health-intake-withdraw.test.ts docs/legal/sr/health-intake-v1.md docs/legal/en/health-intake-v1.md apps/mobile/lib/legal/generated.ts
git commit -m "$(cat <<'EOF'
feat(api): health-intake GET/POST/DELETE with consent + withdrawal

POST writes the intake row and a parallel ConsentRecord(health_intake)
in one transaction — the consent row is the legal-basis proof, the
intake row is the data itself. DELETE hard-deletes intake rows (Art. 17
right to erasure) and writes a HealthIntakeWithdrawal audit row so we
can still answer "did they ever consent and then withdraw" without
keeping the health data itself.
EOF
)"
```

---

### Task 7: Queries factory hooks for health-intake + social-media

**Files:**
- Create: `apps/mobile/lib/queries/health-intake-queries-factory.ts`
- Modify: `apps/mobile/lib/queries/consent-queries-factory.ts` — add `useRecordSocialMediaMutation()`

- [ ] **Step 1: Create the health-intake factory**

`apps/mobile/lib/queries/health-intake-queries-factory.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  healthIntakeInputSchema,
  healthIntakeResponseSchema,
  type HealthIntakeInput,
  type HealthIntakeResponse,
} from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/health-intake`;

export const healthIntakeQueries = {
  latest: () =>
    queryOptions({
      queryKey: ["health-intake", "latest"] as const,
      queryFn: async (): Promise<HealthIntakeResponse | null> => {
        const res = await apiFetch(BASE, { credentials: "include" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Unable to load intake (${res.status})`);
        return healthIntakeResponseSchema.parse(await res.json());
      },
      staleTime: 0,
    }),
};

export function useRecordHealthIntakeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["health-intake", "record"] as const,
    mutationFn: async (input: HealthIntakeInput) => {
      const parsed = healthIntakeInputSchema.parse(input);
      const res = await apiFetch(BASE, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(`Record failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-intake"] });
      queryClient.invalidateQueries({ queryKey: ["consent", "status"] });
    },
  });
}

export function useWithdrawHealthIntakeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["health-intake", "withdraw"] as const,
    mutationFn: async () => {
      const res = await apiFetch(BASE, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Withdraw failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-intake"] });
    },
  });
}
```

- [ ] **Step 2: Extend consent factory with social-media mutation**

Append to `apps/mobile/lib/queries/consent-queries-factory.ts`:

```ts
export function useRecordSocialMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["consent", "social-media"] as const,
    mutationFn: async (input: { accepted: boolean }) => {
      const res = await apiFetch(`${BASE}/social-media`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Record failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent", "status"] });
    },
  });
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm --filter mobile check-types
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/lib/queries/health-intake-queries-factory.ts apps/mobile/lib/queries/consent-queries-factory.ts
git commit -m "$(cat <<'EOF'
feat(queries): hooks for health-intake CRUD + social-media consent

All mutation hooks live in queries-factory files (see
feedback_mutation_hooks_in_factory.md). onSuccess invalidates both the
local cache and ['consent','status'] so the gate state stays accurate.
EOF
)"
```

---

### Task 8: `SocialMediaQuestion` component + wire into `/consent`

**Files:**
- Create: `apps/mobile/components/consent/social-media-question.tsx`
- Modify: `apps/mobile/app/consent.tsx`
- Modify: `apps/mobile/locales/sr.json`, `apps/mobile/locales/en.json`

- [ ] **Step 1: Add i18n keys**

In both locale files, add under a new `consent.socialMedia` block:

`sr.json`:
```json
"socialMedia": {
  "question": "Dozvoljavam Studiju da objavljuje fotografije i snimke sa treninga na društvenim mrežama, na kojima se nalazim.",
  "yes": "Da",
  "no": "Ne",
  "helper": "Vaš izbor možete promeniti u svakom trenutku iz profila."
}
```

`en.json`:
```json
"socialMedia": {
  "question": "I allow the Studio to publish photos and videos from training sessions on social media that include me.",
  "yes": "Yes",
  "no": "No",
  "helper": "You can change your choice at any time from your profile."
}
```

- [ ] **Step 2: Create the component**

`apps/mobile/components/consent/social-media-question.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useThemeTokens } from "@/components/ui/tokens";

type Choice = "yes" | "no";

type Props = {
  value: Choice | null;
  onChange: (next: Choice) => void;
  disabled?: boolean;
};

export function SocialMediaQuestion({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  return (
    <View testID="social-media-question" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Text style={{ color: tokens.text.primary }} className="text-base leading-6">
        {t("consent.socialMedia.question")}
      </Text>
      <View className="mt-4 flex-row gap-3">
        {(["yes", "no"] as const).map((c) => {
          const selected = value === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              testID={`social-media-${c}`}
              disabled={disabled}
              onPress={() => onChange(c)}
              className={`flex-1 items-center rounded-xl border px-4 py-3 ${
                selected ? "border-white/60 bg-white/15" : "border-white/15 bg-transparent"
              }`}
            >
              <Text style={{ color: tokens.text.primary }} className="text-base font-medium">
                {t(`consent.socialMedia.${c}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: tokens.text.muted }} className="mt-3 text-xs">
        {t("consent.socialMedia.helper")}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Wire into `app/consent.tsx`**

Inside the consent screen render, where the document cards are listed, after the last document card and only when `meQuery.data?.user.role === "CLIENT"`, render:

```tsx
{role === "CLIENT" && (
  <SocialMediaQuestion
    value={socialChoice}
    onChange={(next) => {
      setSocialChoice(next);
      socialMediaMutation.mutate({ accepted: next === "yes" });
    }}
    disabled={socialMediaMutation.isPending}
  />
)}
```

Add local state:
```tsx
const [socialChoice, setSocialChoice] = useState<"yes" | "no" | null>(
  status?.socialMediaDecided ? "yes" : null,
);
const socialMediaMutation = useRecordSocialMediaMutation();
```

(`socialChoice` initial — when status reports `socialMediaDecided`, render either Da or Ne pre-selected. Fetch the *current* answer by reading the latest social_media `ConsentRecord` server-side if the status payload doesn't expose it. Simpler: extend the `consent.status` response in Task 4 to include `socialMediaLatestAccepted: boolean | null` so the UI can echo the last choice. **Do this in Task 4 — update Task 4 Step 4 schema and the test to also assert `socialMediaLatestAccepted` is returned**, then come back here.)

Update the "Nastavi" disabled logic — it should require `(socialChoice !== null)` in addition to all gate docs being accepted, for clients.

- [ ] **Step 4: Lint + type-check**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm lint
pnpm --filter mobile check-types
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/components/consent/social-media-question.tsx apps/mobile/app/consent.tsx apps/mobile/locales/
git commit -m "$(cat <<'EOF'
feat(consent): social-media Da/Ne question on /consent gate

Da and Ne both count as decided — only an unanswered state blocks the
Nastavi button. The chosen value is recorded immediately on tap so the
user can change their mind before continuing without us losing the
ledger row from the first tap (each tap = new append-only row).
EOF
)"
```

---

### Task 9: `HealthIntakeForm` component + wire into `/consent`

**Files:**
- Create: `apps/mobile/components/consent/health-intake-form.tsx`
- Modify: `apps/mobile/app/consent.tsx`
- Modify: `apps/mobile/locales/{sr,en}.json`

- [ ] **Step 1: Add i18n keys**

`sr.json` — under `intake`:
```json
"intake": {
  "title": "Vaš životni ritam",
  "notice": "Ovi podaci se koriste isključivo da prilagodimo trening Vašem stanju. Davanje odgovora je dobrovoljno; ako odlučite da ih ne podelite, prihvatate da trening ne možemo posebno prilagoditi. Podatke možete obrisati u svakom trenutku iz svog profila.",
  "consentCheckbox": "Saglasan/saglasna sam da Studio obrađuje ove zdravstvene podatke u svrhu prilagođavanja treninga.",
  "skipOption": "Preskoči — bez prilagođavanja",
  "skipConfirmation": "Trener će videti „intake preskočen". Možete uneti podatke kasnije iz profila.",
  "q": {
    "physicallyActive": "Da li ste fizički aktivni?",
    "firstPilates": "Da li vam je ovo prvi trening pilatesa?",
    "complaints": "Da li imate neke tegobe?",
    "complaintsDetailsLabel": "Opišite ukratko",
    "complaintsDetailsPlaceholder": "npr. bolovi u leđima",
    "injuries": "Da li imate neke povrede?",
    "injuriesDetailsLabel": "Opišite ukratko",
    "injuriesDetailsPlaceholder": "npr. povreda kolena",
    "pregnant": "Da li ste trudni?",
    "postpartum": "Da li ste u postporođajnom periodu?"
  }
}
```

`en.json` — translated equivalents.

- [ ] **Step 2: Create the component**

`apps/mobile/components/consent/health-intake-form.tsx`:

A controlled form with six Da/Ne rows, conditional textareas for Q3/Q4, a consent checkbox (without which `Sačuvaj` is disabled), and a `Preskoči` link. Emits `{ kind: "save", input: HealthIntakeInput } | { kind: "skip" }` via `onSubmit`. ~150-200 lines.

Show this exact JSX skeleton in the plan so the executor doesn't invent novel layout:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import type { HealthIntakeInput } from "@baza/types";
import { useThemeTokens } from "@/components/ui/tokens";

type Submit =
  | { kind: "save"; input: HealthIntakeInput }
  | { kind: "skip" };

type Props = {
  onSubmit: (s: Submit) => void;
  isSubmitting?: boolean;
};

export function HealthIntakeForm({ onSubmit, isSubmitting }: Props) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const [state, setState] = useState({
    isPhysicallyActive: false,
    isFirstPilates: false,
    hasComplaints: false,
    complaintsDetails: "",
    hasInjuries: false,
    injuriesDetails: "",
    isPregnant: false,
    isPostpartum: false,
    consented: false,
  });
  const detailsMissing =
    (state.hasComplaints && !state.complaintsDetails.trim()) ||
    (state.hasInjuries && !state.injuriesDetails.trim());
  const canSubmit = state.consented && !detailsMissing && !isSubmitting;

  return (
    <View testID="health-intake-form" className="gap-4">
      <Text style={{ color: tokens.text.primary }} className="text-lg font-semibold">{t("intake.title")}</Text>
      <Text style={{ color: tokens.text.muted }} className="text-sm leading-5">{t("intake.notice")}</Text>

      <YesNoRow label={t("intake.q.physicallyActive")} testID="q-physicallyActive"
        value={state.isPhysicallyActive}
        onChange={(v) => setState((s) => ({ ...s, isPhysicallyActive: v }))} />
      <YesNoRow label={t("intake.q.firstPilates")} testID="q-firstPilates"
        value={state.isFirstPilates}
        onChange={(v) => setState((s) => ({ ...s, isFirstPilates: v }))} />
      <YesNoRow label={t("intake.q.complaints")} testID="q-complaints"
        value={state.hasComplaints}
        onChange={(v) => setState((s) => ({ ...s, hasComplaints: v }))} />
      {state.hasComplaints && (
        <FreeText label={t("intake.q.complaintsDetailsLabel")}
          placeholder={t("intake.q.complaintsDetailsPlaceholder")}
          testID="complaintsDetails"
          value={state.complaintsDetails}
          onChangeText={(v) => setState((s) => ({ ...s, complaintsDetails: v }))} />
      )}
      <YesNoRow label={t("intake.q.injuries")} testID="q-injuries"
        value={state.hasInjuries}
        onChange={(v) => setState((s) => ({ ...s, hasInjuries: v }))} />
      {state.hasInjuries && (
        <FreeText label={t("intake.q.injuriesDetailsLabel")}
          placeholder={t("intake.q.injuriesDetailsPlaceholder")}
          testID="injuriesDetails"
          value={state.injuriesDetails}
          onChangeText={(v) => setState((s) => ({ ...s, injuriesDetails: v }))} />
      )}
      <YesNoRow label={t("intake.q.pregnant")} testID="q-pregnant"
        value={state.isPregnant}
        onChange={(v) => setState((s) => ({ ...s, isPregnant: v }))} />
      <YesNoRow label={t("intake.q.postpartum")} testID="q-postpartum"
        value={state.isPostpartum}
        onChange={(v) => setState((s) => ({ ...s, isPostpartum: v }))} />

      <Pressable testID="intake-consent" onPress={() => setState((s) => ({ ...s, consented: !s.consented }))}
        className="mt-2 flex-row items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] p-3">
        <View className={`h-5 w-5 rounded border ${state.consented ? "bg-white border-white" : "border-white/40"}`} />
        <Text style={{ color: tokens.text.primary }} className="flex-1 text-sm leading-5">
          {t("intake.consentCheckbox")}
        </Text>
      </Pressable>

      <Pressable testID="intake-save" disabled={!canSubmit}
        onPress={() => onSubmit({
          kind: "save",
          input: {
            isPhysicallyActive: state.isPhysicallyActive,
            isFirstPilates: state.isFirstPilates,
            hasComplaints: state.hasComplaints,
            complaintsDetails: state.hasComplaints ? state.complaintsDetails : undefined,
            hasInjuries: state.hasInjuries,
            injuriesDetails: state.hasInjuries ? state.injuriesDetails : undefined,
            isPregnant: state.isPregnant,
            isPostpartum: state.isPostpartum,
          },
        })}
        className={`mt-4 items-center rounded-2xl py-3 ${canSubmit ? "bg-white" : "bg-white/20"}`}>
        <Text className={`text-base font-semibold ${canSubmit ? "text-black" : "text-white/60"}`}>
          {t("common.continue")}
        </Text>
      </Pressable>
      <Pressable testID="intake-skip" onPress={() => onSubmit({ kind: "skip" })}
        className="items-center py-3">
        <Text style={{ color: tokens.text.muted }} className="text-sm">
          {t("intake.skipOption")}
        </Text>
      </Pressable>
    </View>
  );
}

function YesNoRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const tokens = useThemeTokens();
  return (
    <View testID={testID} className="flex-row items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <Text style={{ color: tokens.text.primary }} className="flex-1 text-sm">{label}</Text>
      <View className="flex-row gap-2">
        {[true, false].map((v) => (
          <Pressable key={String(v)} testID={`${testID}-${v ? "yes" : "no"}`}
            onPress={() => onChange(v)}
            className={`min-w-[56px] items-center rounded-lg border px-3 py-2 ${value === v ? "border-white/60 bg-white/15" : "border-white/15"}`}>
            <Text style={{ color: tokens.text.primary }} className="text-sm">{v ? "Da" : "Ne"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FreeText({ label, placeholder, value, onChangeText, testID }: { label: string; placeholder: string; value: string; onChangeText: (v: string) => void; testID: string }) {
  const tokens = useThemeTokens();
  return (
    <View>
      <Text style={{ color: tokens.text.muted }} className="mb-1 text-xs">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.text.muted}
        multiline
        className="min-h-[72px] rounded-xl border border-white/15 bg-white/[0.04] p-3 text-white"
      />
    </View>
  );
}
```

- [ ] **Step 3: Wire into `app/consent.tsx`**

For clients, render `<HealthIntakeForm />` below the social-media question. On `onSubmit`:
- `{ kind: "save" }` → `useRecordHealthIntakeMutation().mutate(input)`. On success, mark intake as completed in local state.
- `{ kind: "skip" }` → mark intake as skipped in local state (no API call).

Track `intakeStatus: "pending" | "saved" | "skipped"`. The "Nastavi" gate-button is enabled when: all required docs accepted **and** social-media decided **and** intake is `saved` or `skipped`.

- [ ] **Step 4: Type-check + lint**

```bash
pnpm --filter mobile check-types
pnpm lint
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/components/consent/health-intake-form.tsx apps/mobile/app/consent.tsx apps/mobile/locales/
git commit -m "$(cat <<'EOF'
feat(consent): six-question health intake on /consent for clients

Skipping is allowed and explicit — trainer card later renders "intake
skipped" vs. blank answers, which carry different meanings. The Art. 17
consent checkbox gates save (not skip); without it we have no legal
basis to store the data.
EOF
)"
```

---

### Task 10: `ProfileSheet` — "Pravna dokumenta" + "Zdravstveni podaci" sections

**Files:**
- Create: `apps/mobile/components/profile/profile-legal-section.tsx`
- Create: `apps/mobile/components/profile/profile-health-section.tsx`
- Modify: `apps/mobile/components/ui/profile-sheet.tsx`
- Modify: `apps/mobile/locales/{sr,en}.json`

- [ ] **Step 1: Profile legal section**

`apps/mobile/components/profile/profile-legal-section.tsx`:
- Lists `tos`, `privacy`, `eula`, and (for clients) `waiver_adult` or `waiver_minor`.
- For each doc: title, version, accepted-on date (✓) or "Potrebno ažuriranje" (⚠️). Tap opens the doc in an `AppSheet` via existing `LegalDocumentViewer`.
- For clients only: a toggle row "Dozvoljavam objavljivanje snimaka na društvenim mrežama" wired to `useRecordSocialMediaMutation()`. The toggle's current state comes from `consentQueries.status()` enriched with the latest social_media accepted bool (the field added in Task 4).
- Read consent data via `useQuery(consentQueries.status())` and a new query for the per-doc accepted-on date — add `apps/mobile/app/api/consent/history+api.ts` returning the latest accepted row per documentKey. If that endpoint feels like scope creep, the section can render only the status (accepted vs. update-needed) without the exact date and add the date in a follow-up.

Skeleton:

```tsx
import { useTranslation } from "react-i18next";
import { Text, View, Pressable, Switch } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { consentQueries, useRecordSocialMediaMutation } from "@/lib/queries/consent-queries-factory";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useThemeTokens } from "@/components/ui/tokens";

export function ProfileLegalSection() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const meQuery = useQuery(authQueries.me());
  const statusQuery = useQuery(consentQueries.status());
  const socialMutation = useRecordSocialMediaMutation();

  if (!statusQuery.data || !meQuery.data) return null;
  const isClient = meQuery.data.user.role === "CLIENT";

  return (
    <View testID="profile-legal-section" className="gap-2">
      <Text style={{ color: tokens.text.primary }} className="text-sm font-semibold uppercase tracking-wide">
        {t("profile.legalSection")}
      </Text>
      {/* per-doc rows; for now just renders accepted/update-needed pill */}
      {/* ... */}
      {isClient && (
        <View testID="profile-social-toggle" className="mt-3 flex-row items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <Text style={{ color: tokens.text.primary }} className="flex-1 text-sm">
            {t("profile.socialMediaToggle")}
          </Text>
          <Switch
            value={statusQuery.data.socialMediaLatestAccepted ?? false}
            onValueChange={(next) => socialMutation.mutate({ accepted: next })}
            disabled={socialMutation.isPending}
          />
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Profile health section**

`apps/mobile/components/profile/profile-health-section.tsx`:
- Reads `healthIntakeQueries.latest()`.
- If `null` and no withdrawal recorded: render "Nemate unetih podataka" + "Unesi" (opens nested `AppSheet` containing `HealthIntakeForm`).
- If row present: render the four flags + free-text where present, "Izmeni" (re-open `HealthIntakeForm` pre-filled), and "Povuci saglasnost" (confirm-then-call `useWithdrawHealthIntakeMutation()`).
- If withdrawn: render "Saglasnost povučena DD.MM.YYYY" + "Unesi ponovo".

Skip the pre-fill on Izmeni in this task (it's a follow-up enhancement) — opening a blank form is acceptable for the initial cut as long as it's labelled "Ažuriraj" so user knows it appends a new row.

- [ ] **Step 3: Wire into `ProfileSheet`**

In `apps/mobile/components/ui/profile-sheet.tsx`, inside `ProfileSheetContent`, after the existing rows (language switcher, theme switcher, email, sign-out) but inside the same content view, render:

```tsx
<ProfileLegalSection />
<ProfileHealthSection />
```

Be sure they're conditionally rendered only when `meQuery.data?.user` exists.

- [ ] **Step 4: i18n keys**

Add to both locale files:
```
profile.legalSection, profile.legalAccepted, profile.legalUpdateNeeded,
profile.socialMediaToggle,
profile.healthIntakeSection, profile.healthIntakeEdit, profile.healthIntakeWithdraw,
profile.healthIntakeWithdrawConfirm, profile.healthIntakeNone, profile.healthIntakeWithdrawnAt
```

- [ ] **Step 5: Type-check + lint**

```bash
pnpm --filter mobile check-types
pnpm lint
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/components/profile/ apps/mobile/components/ui/profile-sheet.tsx apps/mobile/locales/
git commit -m "$(cat <<'EOF'
feat(profile): legal + health sections inside ProfileSheet

Lives in the existing sheet (no new screen / no new tab) — admins and
trainers see the legal section but not the health one. Toggling
social-media here writes a new ConsentRecord, preserving prior rows so
the ledger reads like an audit log of every change of mind.
EOF
)"
```

---

### Task 11: Booking gate — block bookings for unverified minors after first session

**Files:**
- Modify: `apps/mobile/app/api/bookings/+api.ts`
- Modify: `packages/types/src/index.ts` — add `BOOKING_GUARDIAN_VERIFICATION_REQUIRED` error code constant
- Test: `apps/mobile/test/integration/booking-guardian-gate.test.ts`

- [ ] **Step 1: Write failing test**

`apps/mobile/test/integration/booking-guardian-gate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./reset-db";
import {
  seedMinorClientWithSession,
  seedBookableSession,
  completeBooking,
} from "./seeds";

describe("POST /api/bookings — guardian verification gate", () => {
  beforeEach(resetDb);

  it("allows the FIRST booking even for unverified minor", async () => {
    const { user, cookie } = await seedMinorClientWithSession();
    const session = await seedBookableSession();
    const res = await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: session.id }),
    });
    expect(res.status).toBe(200);
  });

  it("blocks the SECOND booking for unverified minor (after first session completed)", async () => {
    const { user, cookie, clientProfileId } = await seedMinorClientWithSession();
    const firstSession = await seedBookableSession();
    await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: firstSession.id }),
    });
    await completeBooking({ clientProfileId, sessionId: firstSession.id });

    const secondSession = await seedBookableSession();
    const res = await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: secondSession.id }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("GUARDIAN_VERIFICATION_REQUIRED");
  });

  it("admin-toggled guardianVerifiedAt allows subsequent bookings", async () => {
    const { user, cookie, clientProfileId, adminCookie } = await seedMinorClientWithSession();
    const firstSession = await seedBookableSession();
    await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: firstSession.id }),
    });
    await completeBooking({ clientProfileId, sessionId: firstSession.id });
    // admin sets guardianVerifiedAt
    await fetch(`http://localhost:3000/api/admin/clients/${user.id}/guardian-verified`, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });

    const secondSession = await seedBookableSession();
    const res = await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: secondSession.id }),
    });
    expect(res.status).toBe(200);
  });

  it("adult clients are unaffected", async () => {
    const { user, cookie, clientProfileId } = await seedAdultClientWithSession();
    const session1 = await seedBookableSession();
    await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: session1.id }),
    });
    await completeBooking({ clientProfileId, sessionId: session1.id });
    const session2 = await seedBookableSession();
    const res = await fetch("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "BOOK", sessionId: session2.id }),
    });
    expect(res.status).toBe(200);
  });
});
```

If `seedMinorClientWithSession`, `seedBookableSession`, `completeBooking` don't exist as named, look at existing tests (`bookings-cancel.test.ts`, `client-bookings.test.ts`, `consent-status.test.ts`) and either reuse what's there or add small helpers to `apps/mobile/test/integration/seeds.ts`. Keep helper signatures tight.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter mobile test:integration -- booking-guardian-gate
```
Expected: FAIL — second booking returns 200, not 409.

- [ ] **Step 3: Add error code constant**

In `packages/types/src/index.ts`:
```ts
export const BOOKING_ERRORS = {
  GUARDIAN_VERIFICATION_REQUIRED: "GUARDIAN_VERIFICATION_REQUIRED",
} as const;
```

- [ ] **Step 4: Update bookings POST handler**

In `apps/mobile/app/api/bookings/+api.ts`, inside the `BOOK` branch, right after the session lookup and before `findEligibleClientPackage`, add:

```ts
const { getConsentStatus } = await import("@/lib/legal/consent-status");
const consentStatus = await getConsentStatus(guard.user.id);
if (consentStatus.guardianVerificationNeeded) {
  return fail("GUARDIAN_VERIFICATION_REQUIRED", 409);
}
```

(Inline import only if there's a circular-dep concern; otherwise put it with the top-of-file imports.)

`getConsentStatus` already computes `guardianVerificationNeeded = isMinor && hasCompletedSession && !verified`, so this expression naturally allows the *first* booking through (no completed session yet) and blocks subsequent ones until the admin flips `guardianVerifiedAt`.

- [ ] **Step 5: Run tests, confirm pass**

```bash
pnpm --filter mobile test:integration -- booking-guardian-gate
```
Expected: PASS (all 4 cases).

- [ ] **Step 6: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/app/api/bookings/+api.ts packages/types/src/index.ts apps/mobile/test/integration/booking-guardian-gate.test.ts apps/mobile/test/integration/seeds.ts
git commit -m "$(cat <<'EOF'
feat(bookings): block bookings for unverified minors after first session

First session goes through so the studio can collect the paper waiver
in person. After that the gate stays closed until an admin flips
guardianVerifiedAt — the MINOR_PAPER_NEEDED notification (already
firing on first-completed-session) tells admins to do that.
EOF
)"
```

---

### Task 12: Admin `ClientHealthPanel` on client-detail Pregled tab

**Files:**
- Create: `apps/mobile/components/admin/client-health-panel.tsx`
- Modify: `apps/mobile/components/admin/client-detail.tsx` (or `pregled-sub-tab.tsx` — grep for where `ClientLegalPanel` is mounted)
- Modify: `apps/mobile/lib/queries/clients-queries-factory.ts` — add `useClientHealthQuery(clientId)`
- Create: `apps/mobile/app/api/admin/clients/[id]/health+api.ts`

- [ ] **Step 1: Endpoint for admin to fetch a client's latest intake**

`apps/mobile/app/api/admin/clients/[id]/health+api.ts`:

```ts
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { latestIntake } from "@/lib/server/health-intake";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request, { id }: { id: string }) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const client = await prisma.user.findUnique({
    where: { id },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!client?.clientProfile) return fail("Not found", 404);

  const intake = await latestIntake(client.clientProfile.id);
  const withdrawal = await prisma.healthIntakeWithdrawal.findFirst({
    where: { clientProfileId: client.clientProfile.id },
    orderBy: { withdrawnAt: "desc" },
  });
  return ok({ intake, withdrawnAt: withdrawal?.withdrawnAt ?? null });
}
```

- [ ] **Step 2: Add the query factory entry**

In `apps/mobile/lib/queries/clients-queries-factory.ts`, add:
```ts
health: (clientId: string) =>
  queryOptions({
    queryKey: ["clients", clientId, "health"] as const,
    queryFn: async () => {
      const res = await apiFetch(`${BASE}/${clientId}/health`, { credentials: "include" });
      if (!res.ok) throw new Error(`Health fetch failed (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  }),
```

- [ ] **Step 3: Build the panel**

`apps/mobile/components/admin/client-health-panel.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { useThemeTokens } from "@/components/ui/tokens";

type Props = { clientId: string };

export function ClientHealthPanel({ clientId }: Props) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const q = useQuery(clientsQueries.health(clientId));
  if (q.isLoading) return null;
  if (q.isError) return <Text style={{ color: tokens.text.danger }}>{t("common.error")}</Text>;

  const { intake, withdrawnAt } = q.data ?? {};

  if (withdrawnAt) {
    return (
      <View testID="client-health-panel" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <Text style={{ color: tokens.text.primary }} className="text-sm font-semibold">{t("admin.client.healthSection")}</Text>
        <Text style={{ color: tokens.text.muted }} className="mt-2 text-sm">
          {t("admin.client.healthFlags.withdrawn")}
        </Text>
      </View>
    );
  }
  if (!intake) {
    return (
      <View testID="client-health-panel" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <Text style={{ color: tokens.text.primary }} className="text-sm font-semibold">{t("admin.client.healthSection")}</Text>
        <Text style={{ color: tokens.text.muted }} className="mt-2 text-sm">{t("admin.client.healthNone")}</Text>
      </View>
    );
  }
  return (
    <View testID="client-health-panel" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 gap-2">
      <Text style={{ color: tokens.text.primary }} className="text-sm font-semibold">{t("admin.client.healthSection")}</Text>
      {intake.isPregnant && <Flag label={t("admin.client.healthFlags.pregnant")} />}
      {intake.isPostpartum && <Flag label={t("admin.client.healthFlags.postpartum")} />}
      {intake.hasComplaints && <Flag label={t("admin.client.healthFlags.complaints")} detail={intake.complaintsDetails} />}
      {intake.hasInjuries && <Flag label={t("admin.client.healthFlags.injuries")} detail={intake.injuriesDetails} />}
    </View>
  );
}

function Flag({ label, detail }: { label: string; detail?: string | null }) {
  const tokens = useThemeTokens();
  return (
    <View className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
      <Text style={{ color: tokens.text.primary }} className="text-sm font-semibold">{label}</Text>
      {detail ? <Text style={{ color: tokens.text.muted }} className="mt-1 text-xs">{detail}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 4: Mount in client-detail**

Grep for `ClientLegalPanel` import to find its mounting location, then render `<ClientHealthPanel clientId={id} />` directly below it.

- [ ] **Step 5: i18n + type-check + lint**

Add `admin.client.healthSection`, `admin.client.healthNone`, `admin.client.healthFlags.*` to both locale files.

```bash
pnpm --filter mobile check-types
pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD  # consent-gate
git add apps/mobile/app/api/admin/clients/ apps/mobile/components/admin/client-health-panel.tsx apps/mobile/components/admin/client-detail.tsx apps/mobile/lib/queries/clients-queries-factory.ts apps/mobile/locales/
git commit -m "$(cat <<'EOF'
feat(admin): ClientHealthPanel on client detail Pregled tab

Highlights the four flags (pregnant / postpartum / complaints /
injuries) with the free-text trainers need to adjust the session. If
the client withdrew, the panel says so explicitly — empty vs. withdrawn
are semantically distinct for the trainer.
EOF
)"
```

---

### Task 13: E2E — social-media required to continue past `/consent`

**Files:**
- Create: `apps/mobile/test/e2e/consent-gate-social-media.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { withSeededClient } from "./helpers/seed";

test("client must pick Da or Ne before Nastavi enables", async ({ page }) => {
  const { signIn } = await withSeededClient({ acceptedAllGateDocs: true });
  await signIn(page);
  await page.goto("/consent");
  await expect(page.getByTestId("social-media-question")).toBeVisible();
  const continueBtn = page.getByTestId("consent-continue");
  await expect(continueBtn).toBeDisabled();
  await page.getByTestId("social-media-no").click();
  await expect(continueBtn).toBeEnabled();
});
```

- [ ] **Step 2: Run, expect pass**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm exec playwright test test/e2e/consent-gate-social-media.spec.ts --project=chromium --reporter=line
```

If it fails because the existing /consent screen doesn't yet hit the same "social-media required" gate, revisit Task 8 wiring before assuming the test is wrong.

- [ ] **Step 3: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD
git add apps/mobile/test/e2e/consent-gate-social-media.spec.ts
git commit -m "test(e2e): /consent enables Nastavi only after social-media answered"
```

---

### Task 14: E2E — health intake save and skip paths

**Files:**
- Create: `apps/mobile/test/e2e/health-intake.spec.ts`

- [ ] **Step 1: Spec — save path**

```ts
import { test, expect } from "@playwright/test";
import { withSeededClient } from "./helpers/seed";

test("save path: fills six questions + Art.17 checkbox → intake stored", async ({ page }) => {
  const { signIn, getClient } = await withSeededClient({ acceptedAllGateDocs: true });
  await signIn(page);
  await page.goto("/consent");
  // … answer social-media first
  await page.getByTestId("social-media-no").click();
  // fill intake
  await page.getByTestId("q-physicallyActive-yes").click();
  await page.getByTestId("q-firstPilates-yes").click();
  await page.getByTestId("q-complaints-no").click();
  await page.getByTestId("q-injuries-no").click();
  await page.getByTestId("q-pregnant-no").click();
  await page.getByTestId("q-postpartum-no").click();
  await page.getByTestId("intake-consent").click();
  await page.getByTestId("intake-save").click();
  // post-condition: row exists
  const intake = await getClient().latestIntake();
  expect(intake?.isPhysicallyActive).toBe(true);
});

test("skip path: tapping Preskoči records no intake row but proceeds", async ({ page }) => {
  const { signIn, getClient } = await withSeededClient({ acceptedAllGateDocs: true });
  await signIn(page);
  await page.goto("/consent");
  await page.getByTestId("social-media-no").click();
  await page.getByTestId("intake-skip").click();
  await expect(page.getByTestId("consent-continue")).toBeEnabled();
  expect(await getClient().latestIntake()).toBeNull();
});
```

(Adapt `withSeededClient` / `getClient().latestIntake()` to whatever the actual e2e helper module provides — see existing `test/e2e/helpers/*` or the spec `consent-gate-redirect.spec.ts` for patterns.)

- [ ] **Step 2: Run**

```bash
pnpm exec playwright test test/e2e/health-intake.spec.ts --project=chromium --reporter=line
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD
git add apps/mobile/test/e2e/health-intake.spec.ts
git commit -m "test(e2e): intake save + skip paths from /consent"
```

---

### Task 15: E2E — booking gate for unverified minor

**Files:**
- Create: `apps/mobile/test/e2e/booking-guardian-gate.spec.ts`

- [ ] **Step 1: Spec**

Seed a minor client with one completed session and no `guardianVerifiedAt`. Sign in, navigate to availability, tap a session to book, expect an error toast mentioning "guardian potpis potreban" (or whichever i18n string is wired). Then seed `guardianVerifiedAt` directly and reload; expect booking to succeed.

```ts
import { test, expect } from "@playwright/test";
import { withSeededMinorClient, setGuardianVerified } from "./helpers/seed";

test("unverified minor sees error on second booking attempt", async ({ page }) => {
  const { signIn, clientId } = await withSeededMinorClient({ withOneCompletedSession: true });
  await signIn(page);
  await page.goto("/availability");
  await page.getByTestId("session-card").first().click();
  await page.getByTestId("book-button").click();
  await expect(page.getByText(/potpis|guardian/i)).toBeVisible();
});

test("after admin verifies guardian, booking succeeds", async ({ page }) => {
  const { signIn, clientId } = await withSeededMinorClient({ withOneCompletedSession: true });
  await setGuardianVerified(clientId);
  await signIn(page);
  await page.goto("/availability");
  await page.getByTestId("session-card").first().click();
  await page.getByTestId("book-button").click();
  await expect(page.getByText(/rezervisano|booked/i)).toBeVisible();
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm exec playwright test test/e2e/booking-guardian-gate.spec.ts --project=chromium --reporter=line
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rev-parse --abbrev-ref HEAD
git add apps/mobile/test/e2e/booking-guardian-gate.spec.ts
git commit -m "test(e2e): booking blocked for unverified minor; unblocks after admin verify"
```

---

### Task 16: Full-stack verification + final commit

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate
pnpm --filter mobile test:unit
pnpm --filter mobile test:integration
pnpm --filter mobile test:e2e
```

If any individual e2e spec flakes with `ERR_CONNECTION_REFUSED`, re-run it in isolation (see watch-points in handoff) — that's a server-load flake, not a real failure.

- [ ] **Step 2: Lint + type-check**

```bash
pnpm lint
pnpm --filter mobile check-types
```

- [ ] **Step 3: Rebase if `dev` advanced**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate fetch origin
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate log dev..origin/dev --oneline
# if non-empty:
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate rebase origin/dev
```

Important: before rebase, `git -C <wt> stash` the `.env.test` typechange (the `cw` symlink — never committed).

- [ ] **Step 4: Push**

```bash
git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate push
```

- [ ] **Step 5: Update PR #32 test-plan checklist**

Use `gh pr view 32 --json body` to fetch the current body, tick the checkboxes for the new scope, and `gh pr edit 32 --body "..."` to update. See `feedback_subagent_pr_checkboxes.md` — boxes must be ticked when the work is verified-done, not left empty.

---

## Spec-coverage check

Going back through the spec section by section:

- **Health intake schema** (spec §Data model) → Task 1 ✓
- **`getConsentStatus` returns socialMediaDecided** (spec §Helper) → Task 3 + Task 4 ✓
- **Social-media `key: 'social-media'` consent stream** (spec §Social media consent) → Tasks 5, 7, 8 ✓
- **Health intake six questions, conditional details, Art.17 checkbox, skip option** → Tasks 6, 9 ✓
- **Withdrawal — hard delete + audit row** → Task 6 ✓
- **Profile sheet "Pravna dokumenta" + "Zdravstveni podaci"** (spec §Profile sheet) → Task 10 ✓
- **Admin client-detail health panel + four flags** → Task 12 ✓
- **Booking gate for unverified minor after first session** → Task 11, 15 ✓
- **E2E across the three surfaces** → Tasks 13, 14, 15 ✓

Not in this plan (intentional — out of scope or already shipped on PR #32):
- Auth-screen language toggle → already in PR #32 (`feat(auth): tappable legal links + AuthLanguageToggle`).
- `/consent` screen v1 + middleware + `MINOR_PAPER_NEEDED` notification trigger → already in PR #32.
- "Šta se promenilo" diff on version bump → no version is being bumped here; deferred.
- Email-verification upgrade for guardians → spec §Resolved decisions #3 says future.
- Notifications inbox (Step 0 in spec rollout) → not on consent-gate branch's scope; separate PR if needed.

## Self-review fixes applied

While reviewing this plan:

1. **Forward-reference in Task 8 to Task 4** — Step 3 of Task 8 says "extend Task 4 to also return `socialMediaLatestAccepted: boolean | null`." Marking that as required so a subagent picking up Task 4 knows to add the field. Specifically: in Task 4 Step 4, also add `socialMediaLatestAccepted: z.boolean().nullable()` to `consentStatusResponseSchema`; in Task 4 Step 5, set it from the result of the same query that decides `socialMediaDecided` (`.findFirst` already returns the row; surface `.accepted ?? null`). Test addition in Task 4 Step 2: assert `socialMediaLatestAccepted === null` for fresh client and `=== false` after a Ne row.

2. **`completeBooking` helper used in Task 11 may not exist** — flagged in Task 11 Step 1; if helper missing, a small addition to `seeds.ts` is acceptable (creates a `SessionConsumption` row + flips session status to COMPLETED — small enough not to need its own task).

3. **`apiFetch` from `@/lib/api` referenced** — confirmed it exists; pattern is used in `consent-queries-factory.ts`.

4. **`extractEvidence(request)` import path** — confirmed at `apps/mobile/lib/legal/evidence.ts`, exported as named.

5. **`preferredLocale` on `guard.user`** — verify against `requireRole`'s return shape; if it's not on the auth-guard user select, fall back to `"sr"`. The plan code already does `?? "sr"`.
