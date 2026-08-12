# Trainer Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins invite trainers through the app — an optional `role` (CLIENT | TRAINER) on invite creation, a reduced trainer-invite form (no date of birth), and a "Pozovi trenera" entry point on the Katalog → Procenti trenera screen.

**Architecture:** `POST /api/invites` currently hardcodes `role: UserRole.CLIENT`; the input schema gains a `role` field defaulting to CLIENT (ADMIN is never accepted). Redemption (`POST /api/auth/complete-invite`) ALREADY honours `invite.role` and only creates a `clientProfile` for CLIENT — no redemption changes. `UserInvite.role` already exists in Prisma with `@default(CLIENT)` and `dateOfBirth` is already nullable — **no migration needed**. UI: the existing client invite sheet stays client-only; a new trainer invite sheet (email, first name, last name, optional phone — NO date of birth, per owner decision) lives on the Procenti trenera screen, which also gains a trainer-invites list. The Klijenti invites tab filters to CLIENT invites.

**Tech Stack:** Expo React Native (react-native-web), Expo Router API routes, Prisma + Postgres, zod v4 (`@baza/types`), TanStack Query (options-factory convention), Vitest (unit/integration/browser-mode component), Playwright e2e, i18next (sr default + en).

## Global Constraints

- pnpm only. Run scripts via `package.json` (e.g. `pnpm --filter mobile test:unit`, or from `apps/mobile`: `pnpm test:unit`). Never invoke `tsc`/`vitest`/`playwright`/`prisma` directly.
- Type check: `pnpm check-types` from the **repo root** (a bare per-package tsc skips `packages/types`, which is stricter).
- **Never** `prisma db push`. No migrations are expected in this plan; if `prisma migrate dev` ever reports drift, STOP and escalate — never hand-author SQL.
- TDD: write the failing test first, watch it fail, then implement. Red-green-refactor.
- i18n: every visible string (including a11y labels) goes in BOTH `apps/mobile/locales/sr.json` AND `apps/mobile/locales/en.json`. Serbian is the default language.
- No barrel files. Import via direct subpaths (`@baza/types/auth`, `@baza/types/clients`).
- React Compiler is ON: never write `useMemo`/`useCallback`/`React.memo`.
- Mutations live as options-builders/hooks in `apps/mobile/lib/queries/*-queries-factory.ts` — components call `useMutation(xxxMutationOptions(queryClient))`, never inline `useMutation` config with fetch logic.
- No `invalidateQueries` spy assertions in tests — assert observable state.
- `testID` convention: `<context>-<element>`.
- Date-touching code imports `now()`/`nowMs()` from `@/lib/now`, never `new Date()`/`Date.now()` for "current time".
- **Lucide trap:** any NEW lucide icon used in a component must also be re-exported from `apps/mobile/test/component/stubs/lucide-react-native.tsx`, or ~17 component files fail at import while the suite still exits green with ~125 fewer tests. Watch the test COUNT, not just the exit line. (This plan's UI needs no new icon — prefer text buttons; if you do add one, update the stub.)
- Integration tests that exercise server-side date logic must set the `TEST_ANCHOR_TIME` env var — `now()` reads it; `vi.setSystemTime` is NOT enough. (Existing `invites.test.ts` patterns using `nowMs()` offsets are fine as-is.)
- Known pre-existing failures on dev — do NOT chase or "fix": `test/e2e/trainer-clients-sticky-header.spec.ts` and one rotating birthday-gift spec (a seed helper mutates shared state without cleanup).
- Commit messages: `<type>(<scope>): <terse what>` plus a 1–3 sentence WHY body for commits carrying product decisions. Never add a `Claude-Session:` trailer or attribution footer.

---

### Task 1: Input schema — optional role on invite creation

**Files:**
- Modify: `packages/types/src/auth.ts:14-24`
- Modify: `apps/mobile/server/routes/invites.ts:2,47` (mechanical rename only)
- Test: `apps/mobile/test/unit/create-invite-schema.test.ts` (new)

**Interfaces:**
- Consumes: `userInviteFieldsSchema`, `nameFieldSchema`, `dateOfBirthSchema` (all already in/imported by `packages/types/src/auth.ts`).
- Produces: `createInviteInputSchema` (replaces `inviteClientInputSchema` — rename, do not keep an alias), `inviteRoleSchema = z.enum(["CLIENT", "TRAINER"])`, `export type InviteRole = z.infer<typeof inviteRoleSchema>`. Parsed output always has `role` defined (defaulted to `"CLIENT"`); `dateOfBirth` is required iff `role === "CLIENT"`. Tasks 2 and 3 depend on these exact names.

- [ ] **Step 1: Write the failing unit test**

Create `apps/mobile/test/unit/create-invite-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInviteInputSchema } from "@baza/types/auth";

const base = {
  email: "person@test.local",
  firstName: "Ana",
  lastName: "Anić",
};

describe("createInviteInputSchema", () => {
  it("defaults role to CLIENT and requires dateOfBirth for clients", () => {
    const parsed = createInviteInputSchema.parse({
      ...base,
      dateOfBirth: "1990-05-14",
    });
    expect(parsed.role).toBe("CLIENT");
    expect(parsed.dateOfBirth).toBe("1990-05-14");
  });

  it("rejects a client invite without dateOfBirth", () => {
    const result = createInviteInputSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("accepts a TRAINER invite without dateOfBirth", () => {
    const parsed = createInviteInputSchema.parse({ ...base, role: "TRAINER" });
    expect(parsed.role).toBe("TRAINER");
    expect(parsed.dateOfBirth).toBeUndefined();
  });

  it("never accepts ADMIN — admin creation stays out-of-band", () => {
    const result = createInviteInputSchema.safeParse({ ...base, role: "ADMIN" });
    expect(result.success).toBe(false);
  });

  it("still accepts optional phone alongside a trainer role", () => {
    const parsed = createInviteInputSchema.parse({
      ...base,
      role: "TRAINER",
      phone: "+381601234567",
    });
    expect(parsed.phone).toBe("+381601234567");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

From `apps/mobile`: `pnpm test:unit -- create-invite-schema`
Expected: FAIL — `createInviteInputSchema` is not exported.

- [ ] **Step 3: Implement the schema**

In `packages/types/src/auth.ts`, replace `inviteClientInputSchema` (lines 14–24) with:

```ts
// Role is capped at TRAINER by design: admin accounts are created
// deliberately out-of-band (seed/DB), never through the invite path.
export const inviteRoleSchema = z.enum(["CLIENT", "TRAINER"]);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const createInviteInputSchema = userInviteFieldsSchema
  .pick({
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
  })
  .extend({
    firstName: nameFieldSchema,
    lastName: nameFieldSchema,
    phone: z.string().min(6).max(30).optional(),
    role: inviteRoleSchema.default("CLIENT"),
    // Required for CLIENT (enforced below — it feeds clientProfile at
    // redemption); a trainer has no clientProfile, so no DOB is collected.
    dateOfBirth: dateOfBirthSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "CLIENT" && value.dateOfBirth === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "dateOfBirth is required for client invites",
      });
    }
  });
```

Then update the only call site, `apps/mobile/server/routes/invites.ts`: change the import on line 2 and the `parseBody(request, …)` argument on line 47 from `inviteClientInputSchema` to `createInviteInputSchema`. Do NOT change route behavior in this task (the destructure on line 50 keeps working; `role` is simply unused until Task 2 — if the linter rejects the unused-var-free destructure as-is, leave line 50 untouched; it doesn't destructure `role`).

Grep to confirm no other references remain: `grep -rn "inviteClientInputSchema" packages apps --include="*.ts" --include="*.tsx"` → expect zero hits.

- [ ] **Step 4: Run tests + gate**

From `apps/mobile`: `pnpm test:unit -- create-invite-schema` → PASS (5/5).
From repo root: `pnpm check-types` → clean. From `apps/mobile`: `pnpm lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/auth.ts apps/mobile/server/routes/invites.ts apps/mobile/test/unit/create-invite-schema.test.ts
git commit -m "feat(invites): invite input schema accepts role (CLIENT | TRAINER)

Admins can now express who they're inviting; ADMIN is deliberately not in
the enum — admin accounts stay an out-of-band, deliberate act. DOB is only
required for clients because it exists solely to feed clientProfile at
redemption; a trainer's DOB would be collected and silently dropped."
```

---

### Task 2: Server — honour role on POST, expose role on every invite response

**Files:**
- Modify: `apps/mobile/server/routes/invites.ts` (POST lines 50, 66–88; GET select lines 22–30)
- Modify: `apps/mobile/server/routes/invites/[id]/revoke.ts:23-32` (select)
- Modify: `apps/mobile/server/routes/invites/[id]/resend.ts:36-45` (select)
- Modify: `packages/types/src/clients.ts` (`inviteSchema`, around line 125–135)
- Test: `apps/mobile/test/integration/invites.test.ts` (extend)

**Interfaces:**
- Consumes: `createInviteInputSchema` from Task 1 (parsed `role` is always `"CLIENT" | "TRAINER"`).
- Produces: every invite payload (GET list, POST create, revoke, resend) now carries `role`. `inviteSchema` in `packages/types/src/clients.ts` gains `role: userRoleSchema` (import `userRoleSchema` from `./common` — it's the full UserRole enum, safe for parsing whatever is stored). Tasks 3 and 4 rely on `invite.role` being present on the `Invite` type.

- [ ] **Step 1: Write the failing integration tests**

Requires local Postgres: `docker compose up -d` (once per session), then from `apps/mobile`: `pnpm test:db:prepare` (needs the Prisma destructive-consent env — if the prepare script fails on a consent gate, STOP and report NEEDS_CONTEXT rather than working around it).

Append to `apps/mobile/test/integration/invites.test.ts` (inside the existing `describe`, reusing `seedAdmin`, `inviteRequest`, and the mocked `sendInviteEmail`; also add `GET as GET_INVITES` to the existing route imports from `@/server/routes/invites`):

```ts
it("POST /api/invites with role TRAINER creates a TRAINER invite without dateOfBirth", async () => {
  await seedAdmin();
  const response = await POST_INVITE(
    inviteRequest({
      email: "trainer@test.local",
      firstName: "Trener",
      lastName: "Novi",
      phone: "+381601112222",
      role: "TRAINER",
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { invite: { role: string; fullName: string } };
  expect(body.invite.role).toBe("TRAINER");
  expect(body.invite.fullName).toBe("Trener Novi");

  const persisted = await prisma.userInvite.findFirst({
    where: { email: "trainer@test.local" },
  });
  expect(persisted?.role).toBe("TRAINER");
  expect(persisted?.dateOfBirth).toBeNull();
  expect(sendInviteEmailMock).toHaveBeenCalledWith(
    expect.objectContaining({ to: "trainer@test.local" }),
  );
});

it("POST /api/invites ignores a stray dateOfBirth on a TRAINER invite (nothing consumes it)", async () => {
  await seedAdmin();
  const response = await POST_INVITE(
    inviteRequest({
      email: "trainer-dob@test.local",
      firstName: "Trener",
      lastName: "Rodjendan",
      role: "TRAINER",
      dateOfBirth: "1985-03-03",
    }),
  );
  expect(response.status).toBe(200);
  const persisted = await prisma.userInvite.findFirst({
    where: { email: "trainer-dob@test.local" },
  });
  expect(persisted?.dateOfBirth).toBeNull();
});

it("POST /api/invites defaults to CLIENT and returns role on the response", async () => {
  await seedAdmin();
  const response = await POST_INVITE(
    inviteRequest({
      email: "defaulted@test.local",
      firstName: "Default",
      lastName: "Client",
      dateOfBirth: "1992-02-02",
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { invite: { role: string } };
  expect(body.invite.role).toBe("CLIENT");
});

it("POST /api/invites rejects role ADMIN with 400", async () => {
  await seedAdmin();
  const response = await POST_INVITE(
    inviteRequest({
      email: "sneaky@test.local",
      firstName: "Sneaky",
      lastName: "Admin",
      role: "ADMIN",
    }),
  );
  expect(response.status).toBe(400);
  expect(await prisma.userInvite.count()).toBe(0);
});

it("POST /api/invites rejects a CLIENT invite missing dateOfBirth with 400", async () => {
  await seedAdmin();
  const response = await POST_INVITE(
    inviteRequest({
      email: "no-dob@test.local",
      firstName: "No",
      lastName: "Dob",
    }),
  );
  expect(response.status).toBe(400);
});

it("POST /api/invites is forbidden for a TRAINER caller — trainers cannot mint invites", async () => {
  const trainer = await prisma.user.create({
    data: { email: "trainer-caller@test.local", firstName: "T", lastName: "C", role: "TRAINER" },
  });
  setMockUser({
    id: trainer.id,
    role: "TRAINER",
    email: trainer.email,
    isActive: true,
    clientProfile: null,
  });
  const response = await POST_INVITE(
    inviteRequest({
      email: "victim@test.local",
      firstName: "V",
      lastName: "W",
      role: "TRAINER",
    }),
  );
  expect(response.status).toBe(403);
  expect(await prisma.userInvite.count()).toBe(0);
});

it("GET /api/invites returns each invite's role", async () => {
  const admin = await seedAdmin();
  await prisma.userInvite.create({
    data: {
      email: "listed-trainer@test.local",
      firstName: "Listed",
      lastName: "Trainer",
      role: "TRAINER",
      tokenHash: hashToken(generateRawToken()),
      expiresAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
      createdById: admin.id,
    },
  });
  const response = await GET_INVITES(new Request("http://test.local/api/invites"));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { invites: Array<{ email: string; role: string }> };
  expect(body.invites.find((i) => i.email === "listed-trainer@test.local")?.role).toBe("TRAINER");
});

it("POST /api/auth/complete-invite on a TRAINER invite creates a TRAINER user with no clientProfile", async () => {
  const admin = await seedAdmin();
  const rawToken = generateRawToken();
  await prisma.userInvite.create({
    data: {
      email: "trainer-redeem@test.local",
      firstName: "Redeem",
      lastName: "Trainer",
      role: "TRAINER",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
      createdById: admin.id,
    },
  });
  const response = await POST_COMPLETE(
    new Request("http://test.local/api/auth/complete-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "Password123!" }),
    }),
  );
  expect(response.status).toBe(200);
  const created = await prisma.user.findUnique({
    where: { email: "trainer-redeem@test.local" },
  });
  expect(created?.role).toBe("TRAINER");
  expect(
    await prisma.clientProfile.findFirst({ where: { userId: created!.id } }),
  ).toBeNull();
});
```

Also extend the FIRST existing test (`creates a PENDING invite…`) revoke/resend tests minimally: add `role: string` to their body type casts and `expect(…invite.role).toBe("CLIENT")` where the body is already asserted — this pins `role` on the revoke/resend payloads too.

- [ ] **Step 2: Run to verify failures**

From `apps/mobile`: `pnpm test:integration -- invites` (do NOT run the integration suite concurrently with another vitest process — shared test DB).
Expected: new tests FAIL (role missing from responses / TRAINER invite 400 on missing DOB / persisted role CLIENT). The trainer-redemption test may already PASS (complete-invite honours role today) — that's fine; it's a pin, note it in the report.

- [ ] **Step 3: Implement the route changes**

`apps/mobile/server/routes/invites.ts` POST:
- Line 50: destructure `role` too: `const { email, firstName, lastName, phone, dateOfBirth, role } = parsed.data;`
- In the `prisma.userInvite.create` data (lines 67–77): replace `dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,` with `dateOfBirth: role === "CLIENT" && dateOfBirth ? new Date(dateOfBirth) : null,` and replace `role: UserRole.CLIENT,` with `role,`. (The `UserRole` import stays — `requireRole` uses it.)
- Add `role: true,` to the POST create `select` (lines 78–88) and to the GET `findMany` select (lines 22–30). The response mappers spread the row, so `role` flows through once selected.

`apps/mobile/server/routes/invites/[id]/revoke.ts` and `.../resend.ts`: add `role: true,` to each `select` (revoke.ts:23-32, resend.ts:36-45) — their responses parse against `inviteMutationResponseSchema`, which now requires `role`.

`packages/types/src/clients.ts`: add `userRoleSchema` to the existing `./common` import and add `role: userRoleSchema,` to `inviteSchema` (the object ending at line 134).

- [ ] **Step 4: Run tests to verify green**

From `apps/mobile`: `pnpm test:integration -- invites` → all pass (existing + new).
From repo root: `pnpm check-types`. From `apps/mobile`: `pnpm lint && pnpm test:unit`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/server/routes/invites.ts "apps/mobile/server/routes/invites/[id]/revoke.ts" "apps/mobile/server/routes/invites/[id]/resend.ts" packages/types/src/clients.ts apps/mobile/test/integration/invites.test.ts
git commit -m "feat(invites): POST /api/invites honours role; every invite payload carries it

The studio could pay trainers (PR #139) it had no way to onboard — trainers
only existed via seed scripts or direct DB writes. The route stays
ADMIN-only, so a trainer can never mint another trainer; redemption already
branched on invite.role, so accepting a trainer invite needed no changes."
```

---

### Task 3: Trainer invite sheet — reduced form, factory payload, i18n

**Files:**
- Modify: `apps/mobile/lib/queries/invites-queries-factory.ts` (create payload type, ~line 36)
- Create: `apps/mobile/components/admin/trainer-flows/invite-trainer-sheet.tsx`
- Modify: `apps/mobile/locales/sr.json`, `apps/mobile/locales/en.json` (new `admin.trainers.*` keys)
- Test: `apps/mobile/test/component/invite-trainer-sheet.browser.test.tsx` (new)

**Interfaces:**
- Consumes: `createInviteMutationOptions(queryClient)` from `@/lib/queries/invites-queries-factory` (Task 2's server returns `role` so the cache splice parses). `InviteRole` type from `@baza/types/auth`.
- Produces: `InviteTrainerSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })` — Task 4 mounts it. testIDs: `invite-trainer-email-input`, `invite-trainer-name-input`, `invite-trainer-lastname-input`, `invite-trainer-phone-input`, `invite-trainer-submit-button`.

- [ ] **Step 1: Read the reference material first**

Read `apps/mobile/components/admin/client-flows/invite-sheet.tsx` (the component to mirror), `apps/mobile/test/component/helpers.tsx` + one existing sheet test (e.g. `booking-sheet.browser.test.tsx`) to learn the component-test conventions (real i18n, seeded QueryClient, network-boundary interception — do NOT mock the query layer or i18n).

- [ ] **Step 2: Write the failing component test**

Create `apps/mobile/test/component/invite-trainer-sheet.browser.test.tsx`, following the conventions from Step 1. It must cover:

1. Renders the trainer sheet title (assert the literal Serbian copy `"Pozovi trenera"` — the shipped default-locale string) with email, first-name, last-name, and phone inputs, and **no** date-of-birth control (assert `invite-trainer-*` testIDs present, and that no element with testID `invite-create-dob-input` or the DOB placeholder copy exists).
2. Submit is disabled until email, first name, and last name are filled; phone stays optional (fill the three required fields → enabled).
3. Submitting sends `role: "TRAINER"` and no `dateOfBirth` in the POST body to `/api/invites` (intercept at the network boundary per house convention and assert the JSON body), and the sheet closes/resets on success.

Sketch of the shape (adapt to helpers.tsx's actual API):

```tsx
import { describe, expect, it } from "vitest";
// render/seed/network helpers per test/component/helpers.tsx
import { InviteTrainerSheet } from "@/components/admin/trainer-flows/invite-trainer-sheet";

describe("InviteTrainerSheet", () => {
  it("collects the reduced trainer field set — no date of birth", async () => {
    // mount with open=true; assert title "Pozovi trenera";
    // assert the four invite-trainer-* inputs exist;
    // assert queryByTestId("invite-create-dob-input") is null and no
    // DOB placeholder text is rendered.
  });

  it("requires email + first + last name before enabling submit", async () => {
    // submit disabled initially (RN-Web: assert aria-disabled, NOT toBeDisabled);
    // fill the three fields; submit enabled with phone left empty.
  });

  it("submits role TRAINER without dateOfBirth", async () => {
    // intercept POST /api/invites; fill and submit;
    // expect body { email, firstName, lastName, role: "TRAINER" } and
    // expect(body.dateOfBirth).toBeUndefined();
  });
});
```

(RN-Web trap from the notes-picker work: a disabled `Button` renders `aria-disabled`, not the `disabled` attribute — `toBeDisabled()` misreports.)

- [ ] **Step 3: Run to verify failure**

From `apps/mobile`: `pnpm test:component -- invite-trainer-sheet`
Expected: FAIL — module `@/components/admin/trainer-flows/invite-trainer-sheet` does not exist. **Record the suite's total test count before your change** (plain `pnpm test:component`) so you can compare after — the lucide-stub failure mode shrinks the count silently.

- [ ] **Step 4: Implement**

a) Factory: in `invites-queries-factory.ts`, widen the create payload type:

```ts
mutationFn: (payload: { email: string; firstName: string; lastName: string; phone?: string; dateOfBirth?: string; role?: InviteRole }) =>
```

with `import type { InviteRole } from "@baza/types/auth";` at the top. No other factory changes — the splice already handles the returned row, and the `Invite` type gained `role` in Task 2.

b) i18n — add to BOTH locale files under the existing `admin` object as a new `trainers` sibling of `clients` (match surrounding tone; sr first, en mirror):

```jsonc
// sr.json → admin.trainers
{
  "inviteCta": "Pozovi trenera",
  "sheetInvite": "Pozovi trenera",
  "sendInvite": "Pošalji pozivnicu",
  "inviteError": "Slanje pozivnice nije uspelo.",
  "invitesTitle": "Pozivnice",
  "invitesEmpty": "Nema poslatih pozivnica.",
  "inviteCtaA11y": "Pozovi novog trenera"
}
// en.json → admin.trainers
{
  "inviteCta": "Invite trainer",
  "sheetInvite": "Invite trainer",
  "sendInvite": "Send invite",
  "inviteError": "Sending the invite failed.",
  "invitesTitle": "Invites",
  "invitesEmpty": "No invites sent yet.",
  "inviteCtaA11y": "Invite a new trainer"
}
```

Reuse the existing generic field placeholders `admin.clients.placeholderEmail` / `placeholderFirstName` / `placeholderLastName` / `placeholderPhone` ("Email" / "Ime" / "Prezime" / "Telefon (opciono)") — they carry no client-specific wording, and duplicating them would just drift.

c) Component `apps/mobile/components/admin/trainer-flows/invite-trainer-sheet.tsx` — mirror `invite-sheet.tsx` structure exactly (AppSheet, form state persisting across close/reopen and resetting only on successful send, `createInviteMutationOptions`, per-call onSuccess closing + resetting), with these differences:

- Form state: `{ email, firstName, lastName, phone }` — no `dateOfBirth`, no `DateTimePicker`, no `now()`/`toIsoDate` imports.
- Title: `t("admin.trainers.sheetInvite")`; submit label `t("admin.trainers.sendInvite")`; error `t("admin.trainers.inviteError")`.
- Submit disabled while pending or when `!form.email || !form.firstName || !form.lastName`.
- Mutate payload: `{ email, firstName, lastName, phone: form.phone || undefined, role: "TRAINER" }`.
- testIDs as listed in **Interfaces**.
- Header comment: one short paragraph saying this is the trainer counterpart of `client-flows/invite-sheet.tsx` and WHY it's separate (reduced field set — no DOB, which only feeds clientProfile; Klijenti stays client-scoped).

- [ ] **Step 5: Run tests to verify green**

From `apps/mobile`: `pnpm test:component -- invite-trainer-sheet` → PASS, then the full `pnpm test:component` → **total count must be the pre-change count + your new tests** (lucide-stub check). `pnpm lint`; root `pnpm check-types`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/queries/invites-queries-factory.ts apps/mobile/components/admin/trainer-flows/invite-trainer-sheet.tsx apps/mobile/locales/sr.json apps/mobile/locales/en.json apps/mobile/test/component/invite-trainer-sheet.browser.test.tsx
git commit -m "feat(invites): trainer invite sheet with the reduced field set

A separate sheet instead of a role toggle on the client one: the forms
genuinely differ (no DOB — it exists only to feed clientProfile at
redemption) and the Klijenti surface stays honestly client-scoped."
```

---

### Task 4: Entry point on Procenti trenera, trainer invites list, Klijenti filter, e2e

**Files:**
- Modify: `apps/mobile/app/(admin)/katalog/procenti-trenera.tsx`
- Create: `apps/mobile/components/admin/trainer-flows/trainer-invites-section.tsx`
- Modify: `apps/mobile/app/(admin)/klijenti/index.tsx:261` (filter)
- Modify: `apps/mobile/locales/sr.json`, `apps/mobile/locales/en.json` (only if copy beyond Task 3's keys is needed)
- Test: `apps/mobile/test/e2e/trainer-invite.spec.ts` (new)

**Interfaces:**
- Consumes: `InviteTrainerSheet` (Task 3), `invitesQueries.list()`, `revokeInviteMutationOptions`, `resendInviteMutationOptions` from `@/lib/queries/invites-queries-factory`; `invite.role` (Task 2).
- Produces: testIDs `trainer-invite-open-button`, `trainer-invite-row-${id}` (rows), plus reuse of Klijenti's row-action patterns. The Klijenti invites tab shows only CLIENT invites.

- [ ] **Step 1: Read the reference material**

Read `apps/mobile/app/(admin)/klijenti/index.tsx` (invites tab rows, resend/revoke actions, confirm-revoke state at ~line 192 and rows at ~lines 478–530) and `apps/mobile/app/(admin)/katalog/procenti-trenera.tsx` in full. Read `apps/mobile/test/e2e/katalog-tab.spec.ts` and `apps/mobile/test/e2e/helpers/` for e2e conventions (login helpers, seed data, `expect.poll`/`findBy*`-style waits — never `waitForTimeout`).

- [ ] **Step 2: Write the failing e2e spec**

Create `apps/mobile/test/e2e/trainer-invite.spec.ts` following house conventions (admin login helper, testID selectors, state-based waits). Scenario:

1. Log in as admin, navigate to Katalog → open Procenti trenera (existing row at `katalog/index.tsx:158` routes there).
2. Tap `trainer-invite-open-button` → the sheet opens (title "Pozovi trenera").
3. Fill `invite-trainer-email-input` (unique address, e.g. `e2e-trainer-invite@test.local`), name, last name; leave phone empty. Tap `invite-trainer-submit-button`.
4. Expect a `trainer-invite-row-*` to appear in the "Pozivnice" section with the invited name and pending status copy ("Na čekanju").
5. Navigate to Klijenti → invites tab (`admin-clients-tab-invites`): the trainer's email/name must NOT appear there.

Assert on rows/testIDs, not screen titles (AppHeader renders the logo, not the title text).

- [ ] **Step 3: Run to verify failure**

From `apps/mobile` (Postgres up): `pnpm test:e2e:prepare && pnpm test:e2e -- trainer-invite`
Expected: FAIL at step 2 — `trainer-invite-open-button` does not exist.

- [ ] **Step 4: Implement**

a) `trainer-invites-section.tsx` — a component rendering the trainer-invites block so `procenti-trenera.tsx` stays manageable:
- `useQuery(invitesQueries.list())`, filter `invite.role === "TRAINER"`.
- Section heading via `SectionLabel`/`CapsLabel` (match the host screen's section idiom) using `t("admin.trainers.invitesTitle")`; empty state `t("admin.trainers.invitesEmpty")` — render the empty state only when the query has resolved.
- Rows in `GlassCard` with testID `trainer-invite-row-${invite.id}`: fullName, email, status badge reusing the existing status-key map pattern and the existing `admin.clients.inviteStatus*` keys (statuses are role-neutral copy: "Na čekanju" etc.).
- PENDING rows get resend + revoke actions mirroring the Klijenti rows, via `resendInviteMutationOptions` / `revokeInviteMutationOptions` (the splice keeps both screens' lists coherent since they share the cache). Include the same confirm-before-revoke interaction Klijenti uses.
- All new visible copy must already exist in both locale files (Task 3 added the trainer keys; add any missed key to BOTH files).

b) `procenti-trenera.tsx`:
- `const [inviteOpen, setInviteOpen] = useState(false);`
- A `Button` with testID `trainer-invite-open-button`, label `t("admin.trainers.inviteCta")`, `accessibilityLabel={t("admin.trainers.inviteCtaA11y")}`, placed above the trainers list (match the screen's existing layout rhythm; no new lucide icon needed — if you add one anyway, update `test/component/stubs/lucide-react-native.tsx`).
- Mount `<InviteTrainerSheet open={inviteOpen} onOpenChange={setInviteOpen} />` and `<TrainerInvitesSection />` below the rates list.

c) `klijenti/index.tsx` line 261: `const invites = (invitesQuery.data?.invites ?? []).filter((invite) => invite.role === "CLIENT");` — the tab badge count (line 376) then reflects client invites only, which is the point: the Klijenti surface is client-scoped.

- [ ] **Step 5: Run tests to verify green**

From `apps/mobile`: `pnpm test:e2e -- trainer-invite` → PASS. Then `pnpm lint`, root `pnpm check-types`, `pnpm test:unit`, `pnpm test:component` (watch the count).

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(admin)/katalog/procenti-trenera.tsx" apps/mobile/components/admin/trainer-flows/trainer-invites-section.tsx "apps/mobile/app/(admin)/klijenti/index.tsx" apps/mobile/test/e2e/trainer-invite.spec.ts apps/mobile/locales/sr.json apps/mobile/locales/en.json
git commit -m "feat(invites): invite trainers from Procenti trenera; Klijenti stays client-scoped

Procenti trenera is the app's de-facto trainer roster, so onboarding lives
there rather than behind the client list; trainer invites list (with
resend/revoke) beside the rates, and the Klijenti invites tab now filters
to CLIENT so a trainer never shows up as a pending client."
```

---

## Final verification (controller, after all tasks)

The full local gate, in order, from `apps/mobile` (Postgres running):

```sh
pnpm lint && pnpm check-types (root) && pnpm test:unit && pnpm test:component
pnpm test:db:prepare && pnpm test:integration
pnpm test:e2e:prepare && pnpm test:e2e
```

Known-failing on dev (ignore, do not chase): `trainer-clients-sticky-header.spec.ts`, one rotating birthday-gift spec.
