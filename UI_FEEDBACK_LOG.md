# UI Feedback Log — Round 6

Branch: `fix/ui`. Rounds 1–5 are closed; their detail lives in commit history. This document covers the **Round 6 grill** (locked decisions, open work, phased execution plan).

The architectural decisions made in this round are recorded as ADRs (`docs/adr/0001`–`0006`). When in doubt, the ADR is authoritative; this doc is the operational view.

---

## Locked decisions

| # | Topic | Decision | Source |
|---|---|---|---|
| 1 | Admin nav model | **Per-tab Stacks** (Model A). Every bottom tab owns a `<Stack/>`. | ADR-0001 |
| 2 | Detail screens | `sessions/[id]` and `clients/[id]` live in **every tab stack that can push them** (same shared component, two route registrations). | ADR-0001 |
| 3 | Client detail page | New page at `/klijenti/[id]`. Sections: header + pencil → action sheet, current package, package history (one row per ClientPackage, inline "Plaćeno X RSD" or "Poklon paket"), upcoming bookings. Past bookings on `/klijenti/[id]/istorija` sub-route. | grill Q3 |
| 4 | Flow 1 / Flow 2 entry points | Aktivne dodele gets a `+` that opens the assign sheet with client picker prepended. Klijenti action sheet gains a "Nova uplata" (Flow 1) row alongside the existing "Dodeli paket" (Flow 2). Client detail page surfaces both flows. **One shared sheet component** with `mode: "comp" \| "paid"` prop. | grill Q4 |
| 5 | Session card time | Stacked time block: start above, hairline divider, end below. **Fraunces-SemiBold, 22px / lineHeight 24 / letterSpacing -0.3, `fontVariant: ["tabular-nums"]`**. Both digits in `tokens.fg` same weight (user vetoed muted end). Card vertical padding 16→12. Slash+skew code from #34/#40 deleted. | grill Q5 |
| 6 | `visibleToClients` toggle | Both rules apply per save path. **Single-occurrence**: disabled iff this Session has bookings. **Series**: disabled iff any Session in the series has bookings. Disabled + helper text (not hidden). API GET returns both `bookedCount` and `seriesBookedCount`. | ADR-0002 |
| 7 | Naplata filter bug | **Fixed in-session** — RN `URLSearchParams.size` is `undefined`. Replaced 9 call sites with `qs = searchParams.toString()` truthiness pattern. Also locked: client name on every BillingRecord card; subtitle under StatStrip when filters are active. | ADR-0003 |
| 8 | Mesečni prihod section | Replace progress-bar ranks with **chronological bar chart**. X axis bucket & length follow the period pill (Nedelja=7 days, Mesec=30 days, Kvartal=13 weeks, Godina=12 months). Tap a bar → drill into Naplata pre-filtered. | grill Q8 |
| 9 | Iskorišćenost section | Headline ring covers full period window (not just today). Multi-row breakdowns by Sala/ClassType/Trainer, all sorted busiest first. Add day-of-week heatmap + trend line. | grill Q9 |
| 10 | Rezervacije / Paketi content | Rezervacije sub-page: total + cancel breakdown (pre-cutoff vs late) + show-rate + waitlist + chart + top sessions. Paketi sub-page: active + expiring soon + consumption rate + most-sold + comp-vs-paid (data already exists, was removed in #36, re-add here). Lifecycle funnel deferred. | grill Q10 |
| 11 | Prihod sub-page | Headline revenue + chart + revenue-by-PackageType + revenue-by-method + recent payments list. Naplata and Prihod **both stay as separate tabs**; same data, different framing (workflow vs analytics). | grill Q11 |
| 12 | Cross-tab drilldowns | `router.push` with `filter*` query params and `returnTo=/origin/path`. Destination renders return pill ("← Nazad u Izveštaji"). | ADR-0005 |
| 13–14 | Tab bar shape | **4 tabs**: Pregled / Klijenti / Naplata / Izveštaji. Tipovi treninga / Sale / Tipovi paketa move to the **avatar menu** (flat, no Katalog wrapper), open as full-screen modals. Aktivne dodele lifts into `izvestaji/paketi/`. The leaking `sessions` tab dies under Model A. | ADR-0004 + ADR-0006 |
| 15 | Pregled stats | User kept all 4 stats ("overview" framing). Fix: top row was clipped above viewport — `paddingTop` issue on Pregled to handle while touching the file for Phase 1. | grill Q15 |
| 16 | Sessions tab leak | Dies as a side-effect of Model A. No separate task. | Model A |
| 17 | Execution order | **Option A**: 4 sequential phases, one PR each. | grill Q17 |

---

## Target shape after Phase 1

```
app/(admin)/
├── _layout.tsx                       ← <Tabs/> of 4 <Stack/>s
│
├── pregled/
│   ├── _layout.tsx                   ← Stack
│   ├── index.tsx                     ← daily schedule
│   └── sessions/[id].tsx             ← thin wrapper → <SessionDetail/>
│
├── klijenti/
│   ├── _layout.tsx                   ← Stack
│   ├── index.tsx                     ← clients list + invitations
│   ├── [id]/
│   │   ├── index.tsx                 ← client detail (Phase 2)
│   │   └── istorija.tsx              ← past bookings sub-route
│   └── sessions/[id].tsx             ← thin wrapper → <SessionDetail/>
│
├── naplata/
│   ├── _layout.tsx                   ← Stack
│   └── index.tsx                     ← BillingRecord list + Nova uplata sheet
│
├── izvestaji/
│   ├── _layout.tsx                   ← Stack
│   ├── index.tsx                     ← 2×2 grid of headline cards
│   ├── prihod/index.tsx
│   ├── iskoriscenost/index.tsx
│   ├── rezervacije/index.tsx
│   └── paketi/
│       ├── index.tsx
│       └── aktivne-dodele.tsx        ← moved in from old (admin)/packages/
│
└── katalog/                          ← NOT a tab. Avatar menu only.
    ├── _layout.tsx                   ← presentation: "modal"
    ├── tipovi-treninga/index.tsx
    ├── sale/index.tsx
    └── tipovi-paketa/index.tsx       ← was old packages/index.tsx (PackageType CRUD)
```

---

## Phased execution

### Phase 1 — Navigation & plumbing
- Rewire `(admin)/_layout.tsx` to `Tabs` of `Stacks`.
- Create folder structure above. Move existing screens into new homes; preserve current functionality, no UI changes.
- Extract shared session-detail logic into `components/admin/session-detail.tsx`; both stack entries import it.
- Avatar menu component: shows Tipovi treninga / Sale / Tipovi paketa / Jezik / Odjavi se. Routes open as `presentation: "modal"`.
- Fix Pregled StatStrip top-clip on the same pass.

### Phase 2 — Client detail page
- `/klijenti/[id]` page with the 4 sections (Q3).
- `/klijenti/[id]/istorija` past-bookings sub-route, paginated.
- Klijenti card tap → push detail (action sheet demoted to pencil).
- Action sheet gains "Nova uplata" row → opens shared assign sheet in `mode: "paid"`.
- Aktivne dodele `+` button → shared assign sheet with client picker.

### Phase 3 — Izveštaji rebuild
- Landing 2×2 card grid with delta arrows.
- Four sub-pages, each with own period pill and own data shape.
- Cross-tab drilldowns wired via `router.push` + `returnTo`. Naplata reads `returnTo` and renders the pill.
- Aktivne dodele moves into `izvestaji/paketi/`.

### Phase 4 — Polish
- Stacked time block on session cards (spec locked at Q5).
- Naplata: client name on cards + filtered-totals subtitle (locked Q7b).
- Session-edit visibleToClients dual-rule wiring (UI + API `seriesBookedCount`).
- Anything left in "untouched topics" below.

---

## Untouched topics (deferred, not abandoned)

- **Splash logo** — native-build resource, needs prebuild (round-5 #52). No decision needed; user is aware.
- **All-time pill on Izveštaji** — open. Probably belongs on the new landing page after Phase 3.

---

## Login credentials (unchanged)

- Admin: `admin.e2e@example.test` / `Password123!`
- Trainer (Reformer): `trainer.reformer@e2e.test` / `Password123!`
- Client (active Reformer): `client.active.reformer@e2e.test` / `Password123!`

Re-seed: `pnpm --filter mobile test:db:seed-e2e`.

---

## How to pick this up

1. `cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/fix/ui`
2. Read `docs/adr/0001` through `0006` end-to-end (10 min).
3. Read this file end-to-end (5 min).
4. Write a Phase-1 plan (use `writing-plans` skill). Phase 1 touches every screen and is the single biggest risk — the plan-and-review checkpoint is worth the 20 minutes.
5. Implement Phase 1 with `tdd` for route-registration and visibility tests.
6. Verify before declaring complete (`verification-before-completion`): tab bar has 4 items, sessions leak is gone, every existing screen still loads, tests are green.
