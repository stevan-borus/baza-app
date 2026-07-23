# Baza Pilates

A booking app for a Pilates studio. Admins manage the catalog and schedule, trainers run sessions and keep notes per client, clients buy session packages and book classes.

## Language

### People

**Admin**:
A studio operator. Manages ClassTypes, Rooms, PackageTypes, the schedule, and clients. One per studio in practice.
_Avoid_: Owner, manager.

**Trainer**:
A coach who runs Sessions. Sees only their own scheduled Sessions and only Clients they're linked to via past or upcoming Bookings.
_Avoid_: Coach, instructor.

**Client**:
A studio member. Buys ClientPackages and uses them to book Sessions. Has an optional `dateOfBirth` (civil date — month + day are what we act on; year is stored for future age-aware features).
_Avoid_: User, customer, member, account holder.

**User**:
A row in the auth table — has email, password, role (`ADMIN | TRAINER | CLIENT`). Every Client / Trainer / Admin is a User; the converse is true. A `ClientProfile` row hangs off Users with `role = CLIENT`.
_Avoid_: Account.

### Catalog

**ClassType**:
A kind of class — Reformer pilates, Energy pilates, Moms&Minis, Golden age. Carries default capacity, duration, and late-cancel window.

**PackageType**:
A SKU — e.g. "Reformer 12-pack / 30 days". **Scoped to a set of one or more ClassTypes**; a Booking is backable only if the Session's ClassType is in the set. Most SKUs cover one ClassType; a multi-type SKU is a **mix package**. Multiple SKUs may cover the same ClassType (e.g. "Reformer 8" and "Reformer 12" both cover Reformer).

**Mix package**:
A PackageType (and the ClientPackages activated from it) whose ClassType set has more than one member — e.g. Reformer + Energy. Its sessions are **one shared pool**: any of the `sessionCount` sessions can be spent on any covered ClassType, in any ratio. There are **no per-ClassType quotas** — "8 Reformer + 4 Energy" is not a thing.
_Avoid_: "combo", "hybrid", per-type-quota phrasings.

**ClientPackage**:
An instance of a PackageType bought by a Client. Carries `sessionsRemaining`, `expiresAt`, and **snapshots** the PackageType's ClassType set + `lateCancelHours` at purchase time so future PackageType edits don't retroactively change existing packages.
_Avoid_: Pack, subscription.

**StudioRoom**:
A physical room. Sessions happen in one room.
_Avoid_: Studio, location.

### Scheduling

**Session**:
A scheduled class — `(classType, room, trainer, startsAt, endsAt, capacity)`. Sessions are created singly or via a recurring series.

**Recurring series**:
A set of Sessions generated from a weekday pattern (e.g. Mon/Wed/Fri × 4 weeks). Each occurrence is an editable Session; edits can target one occurrence or the whole series.

**Intensity** (intenzitet):
An optional Admin-set 1–3 marking on a single Session telling Clients how hard that occurrence will be. Unmarked (the default) means "not rated" — **not** "easy". Strictly per-occurrence: marking one occurrence of a recurring series never touches its siblings. Admins set, change, or clear it at any time, including after Clients have booked. Purely advisory and display-only: it gates nothing (no booking restrictions, no filtering) and setting/changing it notifies no one. Rendered to every role as a filled-dot meter (●●○), never as stars — stars read as a quality rating, the opposite of an intensity warning.

_Avoid_: "difficulty" / "težina" (ambiguous with weight in a fitness context), "stars"/"rating". The word is **intensity**.

**Booking**:
A Client claiming a slot in a Session. Decrements the matched ClientPackage's `sessionsRemaining` (or doesn't, depending on cancellation timing — see below). Can be created by the Client (via `POST /bookings`, gated by `no_package_for_class`) or by an **Admin** (via the admin booking path, which **skips** the package-eligibility check — see **Admin reservation**).

**Admin reservation**:
A Booking created by an Admin on behalf of a Client to hold a seat. Identical to a self-booked Booking in every downstream system (capacity, waitlist, late-cancel, calendar visibility, client cancel rights) — the *only* differences: (1) the admin path skips the booking-time package check, so `clientPackageId` may be `null` at creation; (2) the Booking carries an audit pointer to the creating Admin. Admins can reserve arbitrarily far into the future. The cron at session-end late-binds a package if one is eligible; if not, it records `NO_PACKAGE` and notifies admins (push + in-app) that the Client attended an unbacked session. Used to lock in long-term Clients whose weekly Session mix varies.

The ClassType scoping rule (a ClientPackage whose ClassType set doesn't include Energy cannot back an Energy Booking) is **not enforced** as a hard rule on Admin reservations — but the admin UI shows a **soft warning** at confirmation time when the Client owns no package for the target ClassType, and the **Pattern reservation** confirmation surfaces a per-ClassType breakdown (e.g. "152 selected: 100 Reformer / 52 Energy — Marija has Reformer only, 52 will be unbacked"). The warning is informational; the admin can proceed.

Creation lives on **one screen**: the admin schedule (existing `pregled` calendar) in reservation mode, with a persistent client-selection banner and a selection toolbar. The **only** entry point is the Client profile's "Reserve sessions" action — the screen is never reachable with no client picked, so the banner is always bound. The route is **admin-only**; trainers and clients hitting it are redirected. Under the hood, every reservation is the same gesture: a set of selected `sessionId`s submitted to a single endpoint (`POST /admin/reservations`).

Selection is built from two interchangeable inputs that both feed the *same* selection set:
- **Tap selection** — Admin taps individual Session cards in the calendar to toggle them. Past Sessions are **not** selectable — reservations are forward-looking; there is no backfill of already-elapsed Sessions from this screen.
- **Pattern overlay** — A power-tool sheet ("Apply pattern…") with two rhythms:
  - **Weekly**: pick weekday(s) + time-of-day + N-week range. Applies the same set every week.
  - **Biweekly**: pick a "Week A" set + a "Week B" set, each with its own weekdays and time. Alternates A/B/A/B across the range. Week A is anchored to the week the range begins in — there is no week-offset toggle; admins reframe by shifting the start date.
  Sessions that don't exist yet (recurring schedule hasn't been materialised that far) are silently skipped; the admin re-runs after extending. The biweekly rhythm exists for the realistic alternating-shift case (e.g. Marija comes Mon/Wed/Fri 7am one week, Tue/Thu 6pm the next). 3+ week rotations are out of scope — admin falls back to tap-select.

The day list is filterable by **ClassType** chips (All / Reformer / Energy / Moms&Minis / Golden age) so admins picking a specific kind don't have to scan past other class types.

Capacity is visible **in the calendar during selection**, not summarised after: every Session card carries a **capacity badge** (booked / capacity), so an admin sees fullness inline. Full Sessions are unselectable **by tap** (the card renders a distinct unavailable treatment). There is no separate "conflict color"; the capacity badge is the cue. Note one current asymmetry: the **pattern overlay** still adds a matched full Session to the selection set (it skips only Sessions the Client has *already booked*, not full ones) — so a pattern can over-select past capacity where a tap cannot. The Client is never auto-waitlisted by a reservation gesture — admin decides per-Session whether to manually waitlist.

_Avoid_: "Hold", "block", "standing booking". The word is **reservation** when admin-initiated, **booking** in all other contexts; storage is one `Booking` table.

**Late-cancel cutoff**:
The point before which a cancellation is "free" (no consumption) and after which it forfeits the session. Resolved per ClientPackage from its snapshotted `lateCancelHours`.

**Waitlist**:
The queue on a full Session. When someone cancels, the next waitlisted Client is auto-booked and notified.

### Billing

**Naplata** (the section): the admin-facing list of past payments, plus the entry point for **Nova uplata**.

**Nova uplata** (Flow 1, atomic):
The default assignment path. Admin records a payment for a Client → a BillingRecord and a ClientPackage are created in the same transaction. Reachable from (a) the Naplata header `+` (no pre-filled client) and (b) a client row's primary action (client pre-filled).
_sr_: "Nova uplata" — _en_: "New payment".

**Poklon paket** (Flow 2, comp):
Admin assigns a free / complimentary ClientPackage directly with no BillingRecord — used for family / friends. Reachable as a secondary action on a client row, never from Naplata.
_sr_: "Poklon paket" — _en_: "Complimentary package". _Avoid_: "komp paket" (colloquial Serbian, was the old label).

**Package activation**:
The act of materializing a ClientPackage from a PackageType for a Client — the moment the SKU's terms (ClassType scope, late-cancel window, session count, validity window) are snapshotted onto the new ClientPackage. Both **Nova uplata** (Flow 1) and **Poklon paket** (Flow 2, including the birthday gift) end in the same activation; they differ only in whether a BillingRecord accompanies it.
_Avoid_: "assign a package" (overloads with admin UI copy), "create a package" (ambiguous between PackageType and ClientPackage).

**BillingRecord**:
A row of money received. Always paired with a ClientPackage in Flow 1 (Nova uplata). Carries `packageTypeId` (nullable — non-null on Flow 1, null on legacy / non-package payments) so revenue-per-PackageType reporting joins cleanly without inferring from timestamps.

**Moji paketi** (the client-facing timeline):
The Client's own view of every ClientPackage they've held, newest first — the client-scoped *mirror* of **Naplata**, seen through a package lens rather than a money lens. Each entry is one of:
- **Paid** — backed by a `BillingRecord`: shows amount + method + the PackageType it bought.
- **Comp** — a Flow-2 ClientPackage (Poklon paket / birthday gift) with no `BillingRecord`: labeled "Poklon paket", **no amount**.
So a comp never leaves a confusing gap (a Client can always see where a package came from), and the list answers both "what did I pay" and "what do I hold". Payment `method` is shown for self-pay methods (card / cash / online); **COMPANY is softened to "Plaćeno"** (the method chip is not surfaced to the Client) — defaulting to less disclosure on a shared-device glance.
This is read-only and Client-scoped: a Client sees only their own. It is **not** Naplata (admin, money-only, all clients) and **not** a generic "payment history" money ledger (which would hide comps).
_Avoid_: "payment history" / "ledger" (excludes comps), "subscription" (no recurring billing exists), reusing "Naplata" for the client view.

### Trainer notes

**TrainerNote**:
Free-text observation a Trainer writes about a Client. Optionally attached to a specific Session — session-less TrainerNotes hold general client context (e.g. an injury history note that isn't tied to one class). The authoring Trainer can read, edit, and delete their own TrainerNotes. Admins can read every TrainerNote about every Client. Clients **never** see TrainerNotes — if a future product need calls for client-visible observations, that is a new concept and a new domain term, not a flag on this one.
_Avoid_: "Note" alone (overloads with the `pause.reason` field, commit notes, and the `editForm.notes` admin form input); "comment"; "client log".

### Campaigns

**Campaign**:
An Admin-composed message sent to a selected audience of Clients at a point in time — covers promotions (discounts), new-program / workshop announcements, and studio news under one concept. Distinct from system-generated notifications: a Campaign carries its own `NotificationType` value (`CAMPAIGN`), so it is filterable in the client feed and bindable to the client's "Promocije / novi programi" preference. The Serbian client-facing label stays **Promocije / novi programi**; **Campaign** is the internal domain term.
_Avoid_: "Promotion" alone (too narrow — excludes new-program announcements), "blast", "broadcast", reusing `GENERAL`.

**Campaign audience** (the targeting model):
A Campaign is sent to an audience computed from one or more **axes**, ANDed together. The axes:
- **Everyone** — all Clients. Mutually exclusive: cannot be ANDed with a narrowing axis.
- **Package state** — active / expired / none / paused.
- **ClassType** — Clients who own or have owned a ClientPackage whose ClassType set **includes** the given ClassType (a mix-package owner belongs to every covered ClassType's audience).
- **Expiring soon** — Clients with an active ClientPackage within N days of `expiresAt` (N typed at send-time). Overlaps `cron:package-expiry` by design; the two are different messages (system nudge vs. marketing offer) and are **not** deduped.
- **Lapsed** — Clients with **no** currently-active ClientPackage **and** no BillingRecord / comp ClientPackage created in the last N days (N typed at send-time, default 30). Intent: "come back & renew." Keyed off payment recency, not bookings — a package lasts ~30 days, so a Client mid-package is never lapsed.
- **Idle package** — Clients who own an active ClientPackage but booked **nothing** in the first N days of that package (no uncancelled Booking with `startsAt` within N days of the ClientPackage's `startsAt`). Intent: "you paid — book your first session before the window burns."

**Campaign channels & opt-out**:
A Campaign is delivered across **three channels at once** — in-app `NotificationLog`, Expo push, and email — so it can reach even Clients who rarely open the app (the prime Lapsed target). Delivery is governed by a single **`campaignsEnabled`** flag on `NotificationPreference` (default `true`) — the client-facing **"Promocije / novi programi"** checkbox the spreadsheet asks for. Rule:
- A Campaign reaches a Client only if `campaignsEnabled = true`.
- Within that: in-app/push subject to `inAppEnabled` / `pushEnabled` and a push token; email subject to a deliverable address.
- **Transactional** email (booking / cancel confirmations) is **not** a Campaign and ignores `campaignsEnabled` — it is never marketing.

Because Campaigns go by email, a compliant **no-login unsubscribe** is mandatory: every Campaign email carries a tokenized `/unsubscribe?token=…` link that flips `campaignsEnabled = false` without requiring sign-in (a deleted-app Client must still be able to opt out). This is a legal requirement (GDPR / anti-spam), not a nicety.

Every audience is implicitly bounded by **deliverability**: a Campaign reaches only Clients who can receive the chosen channel. Deliverability is a delivery constraint, **not** a pickable audience axis.

**Campaign record & history**:
A Campaign **persists as its own row** — `{ id, createdByUserId, title, body, audienceSpec (axes as JSON), recipientCount, sentAt }` — never fire-and-forget. Each delivered `NotificationLog` / email references its Campaign. Rationale: consistent with the studio's audit-everything pattern (`Charge waiver`, `Admin reservation` audit pointer, permanent `BillingRecord`), and it backs an admin-facing **sent-campaigns history** screen (the marketing analogue of **Naplata**'s list of past payments). The send is a point-in-time snapshot: editing a PackageType / ClassType later never rewrites a sent Campaign.
**Campaign lifecycle** (`status`: `DRAFT | SCHEDULED | SENT`):
- **DRAFT** — saved, half-written, no `sentAt`. Editable, deletable.
- **SCHEDULED** — has a `scheduledFor` timestamp; still admin-composed (the admin wrote every word and picked the axes — this does **not** contradict [ADR 0009](docs/adr/0009-campaigns-are-admin-composed-not-cron.md), which only forbids cron *authoring* fixed text, not cron *firing* admin-authored content). Editable and cancellable (→ back to DRAFT) until it fires.
- **SENT** — dispatched, `sentAt` stamped, immutable snapshot.

Scheduled sends reuse the existing **stateless-HTTP-cron** pattern — one new endpoint `POST /api/cron/campaigns/dispatch`, triggered by the same external scheduler as the other crons, finds `status = SCHEDULED AND scheduledFor <= now()`, dispatches, flips to `SENT`. **No job queue / BullMQ / Redis** — that would be over-engineering for a single-studio cadence; a `scheduledFor` column + a polling cron matches every other scheduled job in the codebase. Dispatch interval: **30 min** (marketing tolerates the slop; the interval is the worst-case send-time drift). The interval is external-scheduler config, not code.

**Audience is re-computed at dispatch time**, not frozen at compose — a dynamic segment ("lapsed clients") must reflect who is lapsed *when it sends*, not 3 days earlier. The admin sees a **live preview count** while composing, with the final audience resolved at send.

**Campaign locale**: a Campaign body is admin-composed free text in **one language** (whatever the admin typed) and goes to the whole audience as-is, ignoring each Client's `preferredLocale` — the admin won't author every segment twice. Only the **system-templated chrome** (email header, the mandatory unsubscribe footer) localizes to the Client's locale. Contrast transactional **Booking-change email**, which is fully localized because it's system-authored from i18n keys.

A Campaign is always **admin-composed and admin-sent** — never auto-sent by a cron. The machine's job is to *compute the audience on demand* and surface a live match count while the admin composes; the admin writes the message and decides whether and when to send. (Auto-sent fixed-text nudges, if ever wanted, are a separate concept living alongside `cron:reminders` / `cron:package-expiry`, not a Campaign — see [ADR 0009](docs/adr/0009-campaigns-are-admin-composed-not-cron.md).)
_Avoid_: "inactive" (ambiguous — split into the distinct **Lapsed** and **Idle package** axes).

### Transactional email

**Booking-change email**:
A transactional email sent to a Client when something changes **to** their booking that they did **not** do themselves — never for their own actions. The governing principle: *email the client for things that happen to them, not for things they did* (a self-book / self-cancel was confirmed on-screen; an admin-cancel or auto-promotion happened while they weren't looking). The four events:
- **Waitlist auto-promotion** — a spot opened and the system booked them.
- **Admin cancels their Booking** — single admin cancel.
- **Bulk reservation cancel** — admin cancels N of their Bookings at once → **one summary email** ("your 6 sessions Jun 9–13 were cancelled"), mirroring how the in-app fan-out already coalesces, not N emails.
- **Session updated** — time / room / trainer moved (strongest case: without it the Client shows up wrong).

Explicitly **no** booking-change email for: self-book, self-cancel (client was the actor), or the `cron:reminders` / `cron:package-expiry` nudges (push already handles those).

Fully **localized** to the Client's `preferredLocale` (sr/en) — it is system-authored from i18n keys, unlike an admin-composed Campaign body.

Governed by a **`bookingEmailsEnabled`** flag on `NotificationPreference` (default `true`) — a single client toggle ("Email me about changes to my bookings"), **not** per-event. Legally these are transactional and *could* always-send; offering an opt-out is a deliberate courtesy, not a requirement (contrast `campaignsEnabled`, where opt-out is mandatory). **Scope of the toggle:** it suppresses **only the email channel** — the in-app `NotificationLog` + push for these events still fire regardless, so a Client who muted booking emails still sees an admin-cancel and never silently shows up to a dead class.

`NotificationPreference` thus carries **two** marketing/transactional flags: `campaignsEnabled` (marketing, all channels, mandatory opt-out) and `bookingEmailsEnabled` (transactional email only, courtesy opt-out).
_Avoid_: conflating "transactional" with "marketing" — they obey different rules, different flags, different legal footing.

### Cron

**`cron:sessions`**:
Runs after a Session ends. Scans only **still-active** Bookings (`canceledAt IS NULL`) and decrements `sessionsRemaining` for each — there is no attendance marking, so an uncancelled Booking at session-end *is* a consumed Booking. This is how a **no-show** (Client who neither cancelled nor came) forfeits the session. The cron never touches a cancelled Booking: the late-cancel forfeit is applied **synchronously at cancel-time** in the cancel endpoints (`POST /bookings` cancel and `POST /admin/reservations/cancel-bulk`), not here. So early cancels are free, late cancels are forfeited at cancel-time, and the cron's job is purely to charge the no-shows. Unbacked Admin reservations that reach the cron uncancelled get late-bound to an eligible package (or recorded `NO_PACKAGE`).

**`cron:reminders`**:
Sends notifications about upcoming Sessions to booked Clients.

**`cron:package-expiry`**:
Sends notifications when a Client's ClientPackage is N days from `expiresAt`.

### Notifications

**Cancellation notification**:
Every single-Booking cancellation generates a NotificationLog row for **all admins** and for **the Session's assigned Trainer**. Late cancellations (per `shouldApplyLateCancelPenalty`) trigger an Expo push; early cancellations are silent in-app (NotificationLog created, no push). If a Trainer is also an Admin, they receive only the Trainer-flavored notification. The waitlist auto-promotion notification to the promoted Client is unrelated and unchanged. For **Bulk reservation cancel** the fan-out collapses (see that entry).

**Bulk reservation cancel**:
An admin gesture that cancels N Bookings for one Client in a single transaction (e.g. cancelling all the Mon/Wed/Fri 7am reservations during a Client's travel weeks). One dedicated endpoint, atomic. Per-Booking, the late-cancel penalty applies exactly as it would for a Client-initiated cancel **unless the admin invokes a charge waiver** (see **Charge waiver**); for the typical unbacked **Admin reservation** there's no `clientPackageId` to forfeit, so it's consequence-free in that common case regardless. Waitlist promotion runs per Session as usual. Notification fan-out collapses to **one notification per recipient per bulk action** (one per other admin, one per affected trainer, none to the initiating admin) instead of one-per-cancelled-Booking; the promoted-client `BOOKING_CONFIRMED` push coalesces per `userId` if the same Client is promoted from multiple Sessions in the same bulk action.

**Charge waiver**:
An Admin's deliberate decision, at cancel-time, to forgive the late-cancel forfeit for a specific Booking — used when a Client legitimately can't attend and tells the studio out-of-band (a text, a call) too late to fall before the late-cancel cutoff. Expressed as a per-cancel **"don't charge this session" toggle, defaulting OFF**, on both admin cancel surfaces (the **Bulk reservation cancel** confirm and the quick single cancel on the admin session-detail roster). When on, the cancel **skips the forfeit entirely** — no `SessionConsumption` row, no `sessionsRemaining` decrement — and stamps the Booking's `waivedByUserId` with the acting Admin (the "when" is `canceledAt`). The waiver only has teeth on a **late, package-backed** Booking; an early cancel or an unbacked **Admin reservation** is already consequence-free, so the toggle is a no-op there. A waiver never affects a **no-show**: a Booking left uncancelled is still charged by `cron:sessions` at session-end. The audit column exists to make studio generosity visible and deter habitual over-use.
_Avoid_: "refund" (nothing is charged then given back — the forfeit is skipped), "free cancel", "comp cancel".

**Unbacked-attendance notification**:
When `cron:sessions` processes a completed Booking and resolves no eligible ClientPackage (`NO_PACKAGE` outcome), all admins receive both a push and an in-app NotificationLog naming the Client + Session. Used to surface long-term Clients with **Admin reservation** bookings who are attending without paying for a covering package — the admin then decides whether to sell a package, comp one, or cancel the remaining reservations.

### Test fixtures

**Rich seed**:
The deterministic dataset every test resets to before running. Defined in `apps/mobile/scripts/test/seed-e2e.ts`. Each test layer applies it on its own boundary (per Vitest integration file, per Playwright spec file, per Maestro flow).

**Client matrix**:
The 6-Client shape inside the rich seed, named to make package-state coverage obvious in test output:
- `client.active.reformer@e2e.test` — active Reformer 12-pack with 8 remaining
- `client.active.energy@e2e.test` — active Energy 12-pack
- `client.expired@e2e.test` — Reformer pack expired 7 days ago
- `client.paused@e2e.test` — Reformer pack inside an active pause window
- `client.future@e2e.test` — Reformer pack `startsAt` is 7 days from now
- `client.empty@e2e.test` — no packages at all

**Anchor time**:
A fixed instant the test stack is pinned to so date-dependent tests don't drift over wall-clock time, toggled via the `TEST_ANCHOR_TIME` env var (set to a parseable ISO string to override, leave unset for production / wall-clock behaviour). Server, seed, helpers and Vitest setup all read it through `apps/mobile/lib/now.ts` (`now()` / `nowMs()`); Playwright additionally pins the browser clock via `page.clock.install` in the e2e fixture; Maestro flows still use the device's wall clock — keep date-relative assertions out of Maestro.

There are **two anchors** by test layer (don't assume one):
- **Integration (Vitest)**: `2026-05-09T10:00:00Z` — set in `apps/mobile/test/integration/env.setup.ts` (and `seed-e2e-env.ts`). Use this in integration tests / `lib/server` date-window logic.
- **Playwright e2e**: `2026-05-11T09:00:00Z` (Monday, just before the 10:00 seeded session — a Monday keeps the seeded weekly schedule Reformer Mon/Wed/Fri + Energy Tue/Thu inside the visible week) — set in `apps/mobile/playwright.config.ts`.

When writing a date-relative test, match the anchor of the layer you're in.

## Relationships

- A **Client** owns zero or more **ClientPackages**; each is scoped to a set of one or more **ClassTypes** (one shared session pool per package, regardless of set size).
- A **Session** has one **ClassType**, one **StudioRoom**, one **Trainer**, and zero-or-more **Bookings**.
- A **Booking** matches a **Client**'s eligible **ClientPackage** whose ClassType set includes the **Session**'s **ClassType**. No match → 409 `no_package_for_class`.
- A **Trainer** can only see **Clients** they've been linked to via at least one **Booking** in a **Session** they're assigned to.
- A **Note** belongs to one **Trainer**, one **Client**, and one **Session**.
- **Flow 1** creates a **BillingRecord** and a **ClientPackage** atomically. **Flow 2** creates only a **ClientPackage**.

## Example dialogue

> **Dev:** "When a **Client** books a **Session**, which **ClientPackage** gets decremented?"
> **Domain expert:** "Whichever active, non-expired **ClientPackage** they own whose ClassType set includes the **Session**'s **ClassType**. If they have multiple eligible ones: the **narrowest ClassType set wins** (a Reformer-only pack is spent before a Reformer+Energy **mix package**, preserving the mix pack's flexibility); within the same set size, the one with the **soonest effective expiry**. If none — 409, the booking is rejected."
> **Dev:** "And the package's **late-cancel cutoff** — does that come from the current **PackageType** or the **ClientPackage** itself?"
> **Domain expert:** "The **ClientPackage** — it snapshots `lateCancelHours` at purchase time. If the studio later edits the **PackageType**'s window, in-flight **ClientPackages** keep their original window."

## Flagged ambiguities

- "user" was used to mean both **User** (auth row) and **Client** (the studio-domain person). They're distinct: every Client is a User but not every User is a Client. Spec / API code refers to `userId` for the auth row and `clientProfileId` for the Client.
- "package" was used to mean both **PackageType** (the SKU) and **ClientPackage** (an instance owned by a Client). Always say which.
- "session" overloads with the auth concept (a logged-in browser session). In this domain, **Session** is always the class. Auth sessions are referred to as "sign-in" / "auth session" in code.
