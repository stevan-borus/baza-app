# Phase 1 — Admin Shell Nav Rewire (Model A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire `app/(admin)/` from a flat 5-tab layout to Model A (per-tab Stacks, 4 visible tabs), moving every existing screen into its new home with zero UI changes. Eliminate the `sessions` tab leak. Wire an avatar menu for catalog screens.

**Architecture:** Replace the single `<Tabs/>` in `(admin)/_layout.tsx` with `<Tabs/>` of four `<Stack/>`s — `pregled/`, `klijenti/`, `naplata/`, `izvestaji/`. Detail routes (`sessions/[id]`, `clients/[id]`) live *inside* every tab stack that pushes them, sharing one extracted detail component. Catalog screens (`class-types`, `rooms`, `tipovi-paketa`) move under a `katalog/` group rendered as full-screen modals, reached only from the avatar menu — no `href:null` workarounds. The leaking `sessions` tab dies because there is no top-level `sessions` route anymore.

**Tech Stack:** Expo Router (file-based routing, Stacks/Tabs), React Native, Tamagui, react-i18next, vitest for unit/integration, Playwright for e2e.

---

## Source-of-truth references

- `UI_FEEDBACK_LOG.md` — locked decisions (table rows #1, #2, #13–16). Authoritative for Phase 1.
- Handoff doc: `/var/folders/1f/bpg1xvx9045bk_rybfzhhn3h0000gn/T/handoff-XXXXXX.md.d42StbU9pD` — execution context.
- `AGENTS.md` — Studio Visual System, i18n rules, className-over-inline-style rule. Consult before any styling change. **Phase 1 makes no styling changes** except the one Pregled `paddingTop` fix.
- ADRs 0001/0004/0006 are referenced in `UI_FEEDBACK_LOG.md` but were not persisted to disk during the grill. The log table is self-sufficient for Phase 1; ADRs are not needed.

## What Phase 1 explicitly does NOT do

- No new visual design. Screens render exactly as they do today (one exception: Pregled top padding).
- No Client detail page (Phase 2).
- No Izveštaji sub-pages (Phase 3). The `izvestaji/index.tsx` keeps the current `reports.tsx` content — it just lives under a Stack now.
- No `seriesBookedCount`, no `Nova uplata`, no chart changes.
- No deletion of `class-types`/`rooms` screens — they move, they don't change.

If a step in this plan starts to feel like Phase 2/3/4 work, stop and flag it.

---

## File structure (target after Phase 1)

```
apps/mobile/app/(admin)/
├── _layout.tsx                       Tabs of 4 Stacks + Stack.Screen for katalog group
│
├── pregled/
│   ├── _layout.tsx                   Stack
│   ├── index.tsx                     ← moved from (admin)/index.tsx
│   └── sessions/[id].tsx             thin wrapper → <SessionDetail/>
│
├── klijenti/
│   ├── _layout.tsx                   Stack
│   ├── index.tsx                     ← moved from (admin)/clients.tsx
│   └── sessions/[id].tsx             thin wrapper → <SessionDetail/>
│
├── naplata/
│   ├── _layout.tsx                   Stack
│   └── index.tsx                     ← moved from (admin)/billing.tsx
│
├── izvestaji/
│   ├── _layout.tsx                   Stack
│   ├── index.tsx                     ← moved from (admin)/reports.tsx (UNCHANGED content)
│   └── aktivne-dodele.tsx            ← moved from (admin)/packages/active-assignments.tsx
│
└── katalog/
    ├── _layout.tsx                   Stack with presentation:"modal"
    ├── tipovi-treninga.tsx           ← moved from (admin)/class-types.tsx
    ├── sale.tsx                       ← moved from (admin)/rooms.tsx
    └── tipovi-paketa.tsx              ← moved from (admin)/packages/index.tsx

apps/mobile/components/admin/
└── session-detail.tsx                ← extracted from old (admin)/sessions/[id].tsx

apps/mobile/components/admin/
└── avatar-menu.tsx                   header avatar opening a sheet with katalog + lang + logout

apps/mobile/locales/en.json, sr.json
└── tabs: add "pregled" key (sr: "Pregled", en: "Overview") — reuse existing klijenti/naplata/izvestaji
└── adminMenu: new namespace for avatar-menu rows (tipoviTreninga, sale, tipoviPaketa, jezik, odjava)
```

**Files DELETED in Phase 1:**
- `apps/mobile/app/(admin)/index.tsx` (moved into `pregled/`)
- `apps/mobile/app/(admin)/clients.tsx` (moved into `klijenti/`)
- `apps/mobile/app/(admin)/billing.tsx` (moved into `naplata/`)
- `apps/mobile/app/(admin)/reports.tsx` (moved into `izvestaji/`)
- `apps/mobile/app/(admin)/class-types.tsx` (moved into `katalog/`)
- `apps/mobile/app/(admin)/rooms.tsx` (moved into `katalog/`)
- `apps/mobile/app/(admin)/sessions/` (whole folder — replaced by per-tab `sessions/[id].tsx` wrappers)
- `apps/mobile/app/(admin)/packages/` (whole folder — `index.tsx` → katalog, `active-assignments.tsx` → izvestaji)

## Internal navigation call-sites to update

Run `git grep '/(admin)/'` after the move. Confirmed existing call sites in current code:

| File | Line | Old path | New path |
|---|---|---|---|
| `app/(admin)/index.tsx` | 205 | `/(admin)/sessions/${id}` | `/(admin)/pregled/sessions/${id}` |
| `app/(admin)/index.tsx` | 329 | `/(admin)/class-types` | `/(admin)/katalog/tipovi-treninga` |
| `app/(admin)/index.tsx` | 344 | `/(admin)/rooms` | `/(admin)/katalog/sale` |
| `app/(admin)/packages/index.tsx` | 286 | `/(admin)/packages/active-assignments` | `/(admin)/izvestaji/aktivne-dodele` |

(The line numbers are for *current* `fix/ui` HEAD; after moves they'll be in the new files. Use the new files' contents.)

There may be others outside `(admin)/` that link in — verify with `git grep` step in Task 0.

---

## Task 0: Branch + baseline

**Files:**
- (none — git operations only)

- [ ] **Step 0.1: Confirm clean baseline**

Run: `git status`
Expected: only `UI_FEEDBACK_LOG.md`, `apps/mobile/.env.test`, and the two queries-factory files modified. No new admin route files.

- [ ] **Step 0.2: Commit the pending in-session fixes first**

The URLSearchParams.size fix and the UI_FEEDBACK_LOG rewrite are unrelated to Phase 1 — commit them as a stand-alone commit on `fix/ui` so Phase 1 starts from a clean tree.

```bash
git add UI_FEEDBACK_LOG.md apps/mobile/lib/queries/billing-queries-factory.ts apps/mobile/lib/queries/reports-queries-factory.ts apps/mobile/.env.test
git commit -m "$(cat <<'EOF'
docs(ui): round-6 grill outcome — feedback log rewrite + URLSearchParams.size fix

UI_FEEDBACK_LOG.md is now the round-6 operational view (locked decisions,
target shape, phased plan). The queries-factory change replaces RN's
broken `URLSearchParams.size` (returns undefined in the polyfill) with
`searchParams.toString()` truthiness — list/report screens were silently
dropping `from`/`to`/`period` params. Pattern documented for future
call sites.
EOF
)"
```

- [ ] **Step 0.3: Branch off fix/ui**

```bash
git checkout -b fix/ui/phase-1-nav
```

- [ ] **Step 0.4: Inventory inbound links to admin routes**

Run: `git grep -n '/(admin)/' apps/mobile/`
Expected: A list. Write down every match outside `apps/mobile/app/(admin)/` itself — those are inbound links from elsewhere in the app (auth, role-redirect, etc.) and must be updated when paths change. There should be very few (the admin section is mostly self-contained); confirm before proceeding.

---

## Task 1: Add i18n keys for new shell

**Files:**
- Modify: `apps/mobile/locales/en.json`
- Modify: `apps/mobile/locales/sr.json`
- Test: `apps/mobile/test/unit/i18n-key-parity.test.ts` (existing — re-runs to verify)

- [ ] **Step 1.1: Add `tabs.pregled` and `adminMenu` namespace to en.json**

In the `tabs` object (around line 47 of `locales/en.json`), add `"pregled": "Overview"` alongside the existing keys. Do not remove `dashboard`, `packages`, `manage`, `notifications`, etc. — other roles (client/trainer) still use them.

Add a new top-level namespace `adminMenu`:

```json
"adminMenu": {
  "tipoviTreninga": "Class types",
  "sale": "Rooms",
  "tipoviPaketa": "Package types",
  "jezik": "Language",
  "odjava": "Log out"
}
```

- [ ] **Step 1.2: Mirror keys in sr.json with Serbian values**

```json
"tabs": {
  "pregled": "Pregled",
  ...
},
"adminMenu": {
  "tipoviTreninga": "Tipovi treninga",
  "sale": "Sale",
  "tipoviPaketa": "Tipovi paketa",
  "jezik": "Jezik",
  "odjava": "Odjavi se"
}
```

- [ ] **Step 1.3: Run the i18n parity test**

Run: `cd apps/mobile && pnpm vitest run test/unit/i18n-key-parity.test.ts`
Expected: PASS. (If it fails complaining about missing keys, the en/sr objects diverge — fix and re-run.)

- [ ] **Step 1.4: Commit**

```bash
git add apps/mobile/locales/en.json apps/mobile/locales/sr.json
git commit -m "$(cat <<'EOF'
i18n(admin): add pregled tab + adminMenu namespace for Phase 1 shell

Round-6 ADR-0006 collapses the admin tab bar to 4 (Pregled / Klijenti /
Naplata / Izveštaji) and moves Tipovi treninga / Sale / Tipovi paketa
into an avatar menu. Adds the new label keys ahead of the route rewire
so subsequent commits can compile without missing-translation warnings.
EOF
)"
```

---

## Task 2: Extract `<SessionDetail/>` component

**Files:**
- Read for content: `apps/mobile/app/(admin)/sessions/[id].tsx` (181 lines)
- Create: `apps/mobile/components/admin/session-detail.tsx`

The existing `sessions/[id].tsx` already does everything we need — fetch session, render full detail. Extract its component body verbatim into a named export so both `pregled/sessions/[id].tsx` and `klijenti/sessions/[id].tsx` can render it.

- [ ] **Step 2.1: Read current `sessions/[id].tsx` end-to-end**

Read: `apps/mobile/app/(admin)/sessions/[id].tsx`
Note: imports, the default export, any hooks. The file uses `useLocalSearchParams` to read `id`.

- [ ] **Step 2.2: Create the shared component**

The new component takes `id: string` as a prop (the wrappers will pass it after parsing search params themselves). This keeps `<SessionDetail/>` route-agnostic.

Create `apps/mobile/components/admin/session-detail.tsx` with the entire body of the old `[id].tsx`, but:
- Remove the `useLocalSearchParams` call.
- Change the default export to: `export function SessionDetail({ id }: { id: string }) { ... }`.
- Keep all imports of queries, components, helpers — just relocate them with the new file path in mind.

- [ ] **Step 2.3: Verify it type-checks**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors related to `session-detail.tsx`. (There will still be errors in the old `(admin)/sessions/[id].tsx` if you haven't deleted it yet — that's fine, Task 4 deletes the folder.)

- [ ] **Step 2.4: Commit**

```bash
git add apps/mobile/components/admin/session-detail.tsx
git commit -m "$(cat <<'EOF'
refactor(admin): extract SessionDetail into shared component

Phase 1 of the round-6 admin shell rewire puts a sessions/[id] route
inside every tab stack that can push it. Extracting the body of the old
flat sessions/[id].tsx so two route wrappers can mount the same UI.
Route-agnostic API: takes id as a prop, no useLocalSearchParams.
EOF
)"
```

---

## Task 3: Move screens into new homes (no content changes)

Each sub-task is a pure file move + import-path fix. Do not touch screen logic. If you find yourself "tidying up" content, stop — that's Phase 4.

**Files affected per sub-task — see table.**

| Sub-task | From | To |
|---|---|---|
| 3.1 | `(admin)/index.tsx` | `(admin)/pregled/index.tsx` |
| 3.2 | `(admin)/clients.tsx` | `(admin)/klijenti/index.tsx` |
| 3.3 | `(admin)/billing.tsx` | `(admin)/naplata/index.tsx` |
| 3.4 | `(admin)/reports.tsx` | `(admin)/izvestaji/index.tsx` |
| 3.5 | `(admin)/packages/active-assignments.tsx` | `(admin)/izvestaji/aktivne-dodele.tsx` |
| 3.6 | `(admin)/class-types.tsx` | `(admin)/katalog/tipovi-treninga.tsx` |
| 3.7 | `(admin)/rooms.tsx` | `(admin)/katalog/sale.tsx` |
| 3.8 | `(admin)/packages/index.tsx` | `(admin)/katalog/tipovi-paketa.tsx` |

- [ ] **Step 3.1: Move Pregled (was Dashboard)**

```bash
mkdir -p apps/mobile/app/\(admin\)/pregled
git mv "apps/mobile/app/(admin)/index.tsx" "apps/mobile/app/(admin)/pregled/index.tsx"
```

Then edit `pregled/index.tsx`:
- Line 205 of old content: `router.push('/(admin)/sessions/${session.id}')` → `router.push('/(admin)/pregled/sessions/${session.id}')`.
- Line 329 of old content: `router.push('/(admin)/class-types')` → `router.push('/(admin)/katalog/tipovi-treninga')`.
- Line 344 of old content: `router.push('/(admin)/rooms')` → `router.push('/(admin)/katalog/sale')`.
- Any relative imports (`./components/...`) — confirm they still resolve. The file uses `@/` aliases for shared imports, those are unaffected.
- Fix the `paddingTop` top-clip issue mentioned in row #15 of `UI_FEEDBACK_LOG.md` — find the outermost ScrollView/View in the file and ensure it accounts for the safe-area / floating tab bar. If the current value is `paddingTop: 16` and content clips above the viewport, bump to `paddingTop: 48` (or whatever `useSafeAreaInsets().top + 16` yields). Use whatever pattern other admin screens use today.

- [ ] **Step 3.2: Move Klijenti (was Clients)**

```bash
mkdir -p apps/mobile/app/\(admin\)/klijenti
git mv "apps/mobile/app/(admin)/clients.tsx" "apps/mobile/app/(admin)/klijenti/index.tsx"
```

Verify no internal `/(admin)/clients` self-link exists in the file (it's the list page, shouldn't link to itself). `git grep '/(admin)/clients' apps/mobile/` should now return zero hits *inside* the file. Outside it (other screens linking into klijenti) — update each match to `/(admin)/klijenti`.

- [ ] **Step 3.3: Move Naplata (was Billing)**

```bash
mkdir -p apps/mobile/app/\(admin\)/naplata
git mv "apps/mobile/app/(admin)/billing.tsx" "apps/mobile/app/(admin)/naplata/index.tsx"
```

`git grep '/(admin)/billing' apps/mobile/` and update each hit to `/(admin)/naplata`.

- [ ] **Step 3.4: Move Izveštaji (was Reports)**

```bash
mkdir -p apps/mobile/app/\(admin\)/izvestaji
git mv "apps/mobile/app/(admin)/reports.tsx" "apps/mobile/app/(admin)/izvestaji/index.tsx"
```

`git grep '/(admin)/reports' apps/mobile/` → update to `/(admin)/izvestaji`.

- [ ] **Step 3.5: Move active-assignments into izvestaji**

```bash
git mv "apps/mobile/app/(admin)/packages/active-assignments.tsx" "apps/mobile/app/(admin)/izvestaji/aktivne-dodele.tsx"
```

`git grep '/(admin)/packages/active-assignments' apps/mobile/` → update to `/(admin)/izvestaji/aktivne-dodele`.

- [ ] **Step 3.6: Move class-types into katalog**

```bash
mkdir -p apps/mobile/app/\(admin\)/katalog
git mv "apps/mobile/app/(admin)/class-types.tsx" "apps/mobile/app/(admin)/katalog/tipovi-treninga.tsx"
```

`git grep '/(admin)/class-types' apps/mobile/` → update to `/(admin)/katalog/tipovi-treninga`. (Step 3.1 already covered the one call site in Pregled, but there may be more.)

- [ ] **Step 3.7: Move rooms into katalog**

```bash
git mv "apps/mobile/app/(admin)/rooms.tsx" "apps/mobile/app/(admin)/katalog/sale.tsx"
```

`git grep '/(admin)/rooms' apps/mobile/` → update to `/(admin)/katalog/sale`.

- [ ] **Step 3.8: Move PackageType CRUD into katalog**

```bash
git mv "apps/mobile/app/(admin)/packages/index.tsx" "apps/mobile/app/(admin)/katalog/tipovi-paketa.tsx"
```

`git grep '/(admin)/packages' apps/mobile/` → most hits should now refer to `/(admin)/katalog/tipovi-paketa` (the old CRUD page) or `/(admin)/izvestaji/aktivne-dodele` (the assignments page). Update accordingly. After this, the `packages/` folder under `(admin)/` should be empty.

- [ ] **Step 3.9: Delete now-empty `packages/` folder**

```bash
git rm "apps/mobile/app/(admin)/packages/_layout.tsx"
rmdir "apps/mobile/app/(admin)/packages"
```

- [ ] **Step 3.10: Run typecheck — expect failures from `(admin)/_layout.tsx` and old `sessions/` folder**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | head -40`
Expected: errors in `(admin)/_layout.tsx` referencing routes that no longer exist (`<Tabs.Screen name="clients" .../>` etc.), and possibly in the old `sessions/[id].tsx` if it imports something now moved. Both get fixed in Task 4.

- [ ] **Step 3.11: Commit**

```bash
git add -A apps/mobile/app/\(admin\)
git commit -m "$(cat <<'EOF'
refactor(admin): move screens into Phase 1 folder shape

Pure relocation: every existing admin screen moves into its new folder
under (admin)/pregled, klijenti, naplata, izvestaji, or katalog. Internal
router.push paths updated in-file. _layout.tsx still references the old
flat routes and is broken at this commit — Task 4 rewires it.
EOF
)"
```

---

## Task 4: Rewire `(admin)/_layout.tsx` to Model A

**Files:**
- Rewrite: `apps/mobile/app/(admin)/_layout.tsx`
- Create: `apps/mobile/app/(admin)/pregled/_layout.tsx`
- Create: `apps/mobile/app/(admin)/klijenti/_layout.tsx`
- Create: `apps/mobile/app/(admin)/naplata/_layout.tsx`
- Create: `apps/mobile/app/(admin)/izvestaji/_layout.tsx`
- Create: `apps/mobile/app/(admin)/katalog/_layout.tsx`
- Create: `apps/mobile/app/(admin)/pregled/sessions/[id].tsx`
- Create: `apps/mobile/app/(admin)/klijenti/sessions/[id].tsx`
- Delete: `apps/mobile/app/(admin)/sessions/_layout.tsx`
- Delete: `apps/mobile/app/(admin)/sessions/[id].tsx`

- [ ] **Step 4.1: Create each tab's Stack layout**

Each of `pregled/`, `klijenti/`, `naplata/`, `izvestaji/` gets a `_layout.tsx` identical in structure to the current `packages/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function AdminPregledStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

(Rename the function per tab — `AdminKlijentiStack`, etc. The function name is cosmetic for stack traces.)

- [ ] **Step 4.2: Create the katalog stack with modal presentation**

`apps/mobile/app/(admin)/katalog/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function AdminKatalogStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
      }}
    />
  );
}
```

- [ ] **Step 4.3: Create the two `sessions/[id].tsx` wrappers**

`apps/mobile/app/(admin)/pregled/sessions/[id].tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";
import { SessionDetail } from "@/components/admin/session-detail";

export default function PregledSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetail id={id} />;
}
```

`apps/mobile/app/(admin)/klijenti/sessions/[id].tsx`: same body, function name `KlijentiSessionDetail`.

```bash
mkdir -p apps/mobile/app/\(admin\)/pregled/sessions
mkdir -p apps/mobile/app/\(admin\)/klijenti/sessions
```

- [ ] **Step 4.4: Delete the old top-level `sessions/` folder**

```bash
git rm "apps/mobile/app/(admin)/sessions/[id].tsx"
git rm "apps/mobile/app/(admin)/sessions/_layout.tsx"
rmdir "apps/mobile/app/(admin)/sessions"
```

- [ ] **Step 4.5: Rewrite `(admin)/_layout.tsx`**

Replace the current 76-line file with:

```tsx
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
} from "@/lib/tab-layout-theme";

function TabIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={20} {...props} />;
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Tabs
      screenOptions={{ ...getAppTabScreenOptions(isDark), headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} isDark={isDark} />}
    >
      <Tabs.Screen
        name="pregled"
        options={{
          title: t("tabs.pregled"),
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="klijenti"
        options={{
          title: t("tabs.clients"),
          tabBarIcon: ({ color }) => <TabIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="naplata"
        options={{
          title: t("tabs.billing"),
          tabBarIcon: ({ color }) => (
            <TabIcon name="credit-card" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="izvestaji"
        options={{
          title: t("tabs.reports"),
          tabBarIcon: ({ color }) => <TabIcon name="bar-chart" color={color} />,
        }}
      />
      <Tabs.Screen name="katalog" options={{ href: null }} />
    </Tabs>
  );
}
```

Note: `katalog` is `href:null` so it doesn't render a tab. It IS visible to Expo Router as a group, so deep-linking to `/(admin)/katalog/sale` works, and the avatar menu can `router.push` into it. Modal presentation is set inside `katalog/_layout.tsx`.

- [ ] **Step 4.6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean. Any remaining errors are likely stale imports — fix them.

- [ ] **Step 4.7: Run lint**

Run: `pnpm lint`
Expected: clean (or only pre-existing warnings unrelated to this change).

- [ ] **Step 4.8: Smoke-test in the running dev server (manual)**

Start (or confirm running): `cd apps/mobile && pnpm start --port 8090` and load the web build.
Log in as `admin.e2e@example.test` / `Password123!`. Verify:
- Tab bar shows exactly 4 tabs (Pregled / Klijenti / Naplata / Izveštaji). Not 5. Not 8.
- Tap each tab — the matching screen loads with no console error.
- On Pregled, tap a session card — pushes `/pregled/sessions/[id]`; back button returns to Pregled. **No new tab appears in the bar mid-push.** This is the "sessions tab leak" gone.
- The Pregled top stats row is no longer clipped above the viewport.
- The catalog tab is NOT in the bar (avatar menu doesn't exist yet — that's Task 6 — but the *tab* must already be hidden).

If any of those fail, do not commit. Diagnose first.

- [ ] **Step 4.9: Commit**

```bash
git add -A apps/mobile/app/\(admin\)
git commit -m "$(cat <<'EOF'
refactor(admin): Model A — Tabs of Stacks, 4-tab shell, sessions leak fixed

Replace the flat 5-tab admin layout with 4 tabs (Pregled / Klijenti /
Naplata / Izveštaji), each owning its own Stack. Detail routes
(sessions/[id]) now live inside the originating tab's stack via two
thin wrappers around the shared <SessionDetail/> component, so pushing
to detail no longer leaks a sibling tab into the bar. Catalog screens
move into a katalog/ group (href:null, modal presentation) reachable
only via deep link until the avatar menu lands in Task 6.
EOF
)"
```

---

## Task 5: Route registration test

**Files:**
- Test: `apps/mobile/test/unit/admin-routes.test.ts`

A static test that asserts the expected files exist on disk. Cheap, fast, catches accidental deletion / typos.

- [ ] **Step 5.1: Write the failing test**

Create `apps/mobile/test/unit/admin-routes.test.ts`:

```ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const adminRoot = resolve(__dirname, "../../app/(admin)");

const required = [
  "_layout.tsx",
  "pregled/_layout.tsx",
  "pregled/index.tsx",
  "pregled/sessions/[id].tsx",
  "klijenti/_layout.tsx",
  "klijenti/index.tsx",
  "klijenti/sessions/[id].tsx",
  "naplata/_layout.tsx",
  "naplata/index.tsx",
  "izvestaji/_layout.tsx",
  "izvestaji/index.tsx",
  "izvestaji/aktivne-dodele.tsx",
  "katalog/_layout.tsx",
  "katalog/tipovi-treninga.tsx",
  "katalog/sale.tsx",
  "katalog/tipovi-paketa.tsx",
];

const forbidden = [
  "index.tsx",
  "clients.tsx",
  "billing.tsx",
  "reports.tsx",
  "class-types.tsx",
  "rooms.tsx",
  "sessions/[id].tsx",
  "sessions/_layout.tsx",
  "packages/index.tsx",
  "packages/active-assignments.tsx",
  "packages/_layout.tsx",
];

describe("admin route shape (Model A)", () => {
  test.each(required)("exists: %s", (rel) => {
    expect(existsSync(resolve(adminRoot, rel))).toBe(true);
  });

  test.each(forbidden)("must not exist: %s", (rel) => {
    expect(existsSync(resolve(adminRoot, rel))).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run it**

Run: `cd apps/mobile && pnpm vitest run test/unit/admin-routes.test.ts`
Expected: PASS (all `required` files exist, all `forbidden` files don't).

If a `required` fails: a Task 3 or 4 move was missed.
If a `forbidden` fails: an old file wasn't actually deleted by `git mv` (rare — possibly an editor-saved copy or .DS_Store).

- [ ] **Step 5.3: Commit**

```bash
git add apps/mobile/test/unit/admin-routes.test.ts
git commit -m "$(cat <<'EOF'
test(admin): assert Phase 1 route shape via filesystem check

Cheap guardrail against accidental file deletion or rename of admin
shell routes. Runs in vitest, no app boot needed. Will flag any future
refactor that drops one of the per-tab stacks or resurrects a flat
route from the old layout.
EOF
)"
```

---

## Task 6: Avatar menu

**Files:**
- Create: `apps/mobile/components/admin/avatar-menu.tsx`
- Modify: `apps/mobile/app/(admin)/pregled/index.tsx` — render `<AvatarMenu/>` in the header area
- Modify: `apps/mobile/app/(admin)/klijenti/index.tsx` — same
- Modify: `apps/mobile/app/(admin)/naplata/index.tsx` — same
- Modify: `apps/mobile/app/(admin)/izvestaji/index.tsx` — same

The four tab indexes each already render their own page header (these are non-Stack-header pages). The avatar slots into the existing header area of each. We do not introduce a shared layout-level header in Phase 1 — that's a larger Phase 4 polish task.

- [ ] **Step 6.1: Create `<AvatarMenu/>`**

`apps/mobile/components/admin/avatar-menu.tsx`:

```tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/app-sheet";
import { authQueries } from "@/lib/queries/auth-queries-factory";
// Use existing avatar component pattern — check apps/mobile/components/ui
// for what's already used elsewhere (e.g. <Avatar/> or initials chip).
// If none exists, render a small circular Pressable with user initial.

type MenuRow = {
  key: string;
  label: string;
  onPress: () => void;
};

export function AvatarMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const rows: MenuRow[] = [
    {
      key: "tipoviTreninga",
      label: t("adminMenu.tipoviTreninga"),
      onPress: () => {
        setOpen(false);
        router.push("/(admin)/katalog/tipovi-treninga");
      },
    },
    {
      key: "sale",
      label: t("adminMenu.sale"),
      onPress: () => {
        setOpen(false);
        router.push("/(admin)/katalog/sale");
      },
    },
    {
      key: "tipoviPaketa",
      label: t("adminMenu.tipoviPaketa"),
      onPress: () => {
        setOpen(false);
        router.push("/(admin)/katalog/tipovi-paketa");
      },
    },
    // Language toggle and Log out wiring:
    //   - Language: call the existing locale-switch helper used elsewhere
    //     (search for `i18n.changeLanguage` in apps/mobile/ to find it).
    //   - Log out: call authQueries.logout mutation, then router.replace("/").
    //     See how other screens log out today before copying.
  ];

  return (
    <>
      {/* Avatar trigger — Pressable circle with user initial. */}
      {/* TODO when implementing: read user from authQueries.me(); show initial. */}
      <AppSheet open={open} onOpenChange={setOpen}>
        {rows.map((r) => (
          <AppSheet.Row key={r.key} onPress={r.onPress}>
            {r.label}
          </AppSheet.Row>
        ))}
      </AppSheet>
    </>
  );
}
```

This stub deliberately leaves the language and logout rows out — they touch existing helpers that need to be located in the codebase first. If the menu has fewer than 5 rows at the end of this task, that's expected. The point of Phase 1 is the *navigation shape*; lang/logout polish belongs to Phase 4.

Note: `<AppSheet/>` is the shared component named in memory notes. Confirm its API by reading `apps/mobile/components/ui/app-sheet.tsx` before writing the JSX above — if the API differs (e.g. takes children, not Rows), match what's actually there.

- [ ] **Step 6.2: Wire `<AvatarMenu/>` into each tab's index**

For each of `pregled/index.tsx`, `klijenti/index.tsx`, `naplata/index.tsx`, `izvestaji/index.tsx`: locate the existing page header / top bar area and drop `<AvatarMenu/>` in the right-hand slot. If the screen currently has no header, add one — a minimal `<View>` row with the screen title on the left and `<AvatarMenu/>` on the right. Use whatever pattern is already established in any one screen and replicate.

- [ ] **Step 6.3: Smoke-test in dev**

In each of the 4 tabs:
1. Avatar visible top-right.
2. Tap → sheet opens with 3 catalog rows.
3. Tap "Tipovi treninga" → route pushes `/(admin)/katalog/tipovi-treninga` as a modal (you can dismiss with the OS back gesture / hardware back / a close button if `<Stack/>` provides one).
4. Repeat for Sale and Tipovi paketa.

- [ ] **Step 6.4: Commit**

```bash
git add apps/mobile/components/admin/avatar-menu.tsx apps/mobile/app/\(admin\)/
git commit -m "$(cat <<'EOF'
feat(admin): avatar menu — catalog screens out of the tab bar

Adds <AvatarMenu/> with three rows for the catalog screens that moved
out of the bar in Task 4. Sheet-based, opens from the avatar in each
tab's header area. Language and logout rows are stubbed for Phase 4 —
the immediate goal is just to make Tipovi treninga / Sale / Tipovi
paketa reachable now that they're hidden from the tab bar.
EOF
)"
```

---

## Task 7: Run the whole test suite + e2e admin smoke

**Files:** none modified.

- [ ] **Step 7.1: Unit + integration**

Run: `cd apps/mobile && pnpm vitest run`
Expected: all green, including the new `admin-routes.test.ts`. Pre-existing red tests unrelated to admin routing should be flagged but not fixed in this PR — note them in the PR description if any.

- [ ] **Step 7.2: e2e admin spec**

Run: `cd apps/mobile && pnpm test:e2e admin.spec.ts` (or equivalent — check package.json `scripts`).
Expected: green. The e2e spec uses `t.tabs.*` and `t.admin.manage.*` keys; the underlying flows should still work even though the underlying routes moved — verify.

If `admin.spec.ts` fails because a step tries to click "Manage" (the old combined tab that doesn't exist anymore), that's a real test update — the test should be split per new tab. Fix the test as needed; the goal of Phase 1 is for the admin section to be usable by the same user, not for the e2e to be untouched.

- [ ] **Step 7.3: Lint + typecheck final pass**

```bash
pnpm lint
cd apps/mobile && npx tsc --noEmit
```

Expected: both clean.

- [ ] **Step 7.4: Manual verification checklist (per `verification-before-completion`)**

Walk through and confirm each:
- [ ] Tab bar shows 4 tabs.
- [ ] Tapping a session card from Pregled does not flash a new tab in the bar.
- [ ] Each of the old screens is reachable: Pregled list, Clients list, Billing list, Reports list, Aktivne dodele, Class types (via avatar), Rooms (via avatar), Package types (via avatar).
- [ ] No broken images / placeholder screens.
- [ ] i18n: switch to Serbian, verify "Pregled" label appears.
- [ ] Logging out still works (if you wired it; if not, note as Phase 4 follow-up).

- [ ] **Step 7.5: Commit (only if anything changed in this task — usually nothing does)**

If e2e tests required updates, commit them with a focused message:

```bash
git add apps/mobile/test/e2e/admin.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): update admin spec for Model A tab shape

The admin e2e spec was tab-aware (Manage / Packages / Reports etc.).
Phase 1 collapsed those into 4 tabs and moved catalog flows into the
avatar menu — selectors here mirror the new shape so the suite stays
representative of how the admin actually navigates today.
EOF
)"
```

---

## Task 8: Open the PR back into `fix/ui`

**Files:** none.

- [ ] **Step 8.1: Push**

```bash
git push -u origin fix/ui/phase-1-nav
```

- [ ] **Step 8.2: Open PR**

```bash
gh pr create --base fix/ui --head fix/ui/phase-1-nav --title "Phase 1: admin shell — Tabs of Stacks (Model A)" --body "$(cat <<'EOF'
## Summary

- Rewires `(admin)/_layout.tsx` from a flat 5-tab layout to Model A: 4 tabs (Pregled / Klijenti / Naplata / Izveštaji), each owning a `<Stack/>`.
- Moves every existing screen into its new tab-stack folder. No visual changes other than the Pregled top-padding clip fix.
- Catalog screens (Tipovi treninga / Sale / Tipovi paketa) move out of the tab bar into `katalog/` (modal stack), reached via a new avatar menu.
- Extracts the shared `<SessionDetail/>` component; `pregled/sessions/[id]` and `klijenti/sessions/[id]` are thin wrappers. Eliminates the "sessions tab leak" reported in round-5/6 feedback.
- Adds a filesystem-level route shape test and updates i18n.

## Test plan

- [ ] `pnpm vitest run` (full suite, including new `admin-routes.test.ts`)
- [ ] `pnpm test:e2e admin.spec.ts`
- [ ] Manual: 4-tab bar, no flash on session detail push, avatar menu opens catalog modals, Pregled stats row visible.
- [ ] i18n: pregled label renders in sr + en.

## Out of scope (Phase 2/3/4 follow-ups)

- Client detail page (`/klijenti/[id]`).
- Izveštaji split into 4 sub-pages.
- Avatar menu language/logout rows (stubbed).
- Stacked time block on session cards.
- `seriesBookedCount` API + visibleToClients dual-rule wiring.
EOF
)"
```

Return the PR URL.

---

## Self-Review

**1. Spec coverage** (UI_FEEDBACK_LOG.md Phase 1 bullets):
- "Rewire `(admin)/_layout.tsx` to Tabs of Stacks" → Task 4.
- "Create folder structure (pregled/, klijenti/, naplata/, izvestaji/ with sub-routes)" → Task 4.1, Task 3.
- "Move existing screens into new homes — no UI changes yet" → Task 3.
- "Wire avatar menu" → Task 6.
- "Kill `sessions` tab leak" → Task 4.4 + Task 4.5 (no top-level `sessions` route).
- "Shared session-detail component" → Task 2.
- "Fix Pregled StatStrip top-clip" → Task 3.1 (`paddingTop` adjustment).
- Phased-execution Phase 1 list complete.

**2. Placeholder scan:**
- Task 6.1 contains a `// TODO when implementing` note for the avatar trigger and explicitly defers language/logout rows to Phase 4. This is acknowledged-and-bounded ambiguity, not a placeholder — the menu opens and routes to the three catalog screens, which is what Phase 1 promises.
- Task 6.2 says "use whatever pattern is already established" for header placement. This is intentional — we don't know the current header pattern without reading the four files at execution time. The instruction is concrete (drop into header right-hand slot of each tab index).

**3. Type consistency:**
- `<SessionDetail/>` consistently `{ id: string }` prop (Task 2.2, Task 4.3).
- Route paths: `/(admin)/katalog/tipovi-treninga`, `/(admin)/katalog/sale`, `/(admin)/katalog/tipovi-paketa` consistent across Task 3, Task 5, Task 6.
- i18n keys: `adminMenu.tipoviTreninga`, `adminMenu.sale`, `adminMenu.tipoviPaketa` consistent (Task 1, Task 6).
- Folder names `pregled/klijenti/naplata/izvestaji/katalog` consistent across Tasks 3, 4, 5, 6.

Plan is internally consistent.
