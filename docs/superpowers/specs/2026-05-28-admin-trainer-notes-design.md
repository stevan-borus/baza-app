# Admin TrainerNotes panel + remove client visibility — design

Date: 2026-05-28
Status: Draft

## Problem

TrainerNote audience is wrong on both ends:

1. **Admins can't see notes in the app.** The data exists, the API exposes it for admins, but no admin UI surfaces it. An admin who wants to know what a trainer wrote about a client has to query the API by hand.
2. **Clients can see notes about themselves.** The home tab shows the latest three under "From your trainer", and the profile tab links to a full history. TrainerNotes are internal observations a trainer writes for their own and the studio's reference — they are not addressed to the client, and surfacing them creates a chilling effect on what trainers are willing to write down.

The recent trainer overhaul (#40, commit 4c250a7) reworked trainer-owned notes but did not change the admin or client surfaces. This spec corrects both.

## Domain change

Locking the canonical definition. `CONTEXT.md` previously defined a **Note** as visible to "the writing Trainer and Admins" and as always "attached to a specific Session" — both already wrong (session is nullable in the schema; clients currently see notes).

Updated entry (already written to `CONTEXT.md` in this branch):

> **TrainerNote**:
> Free-text observation a Trainer writes about a Client. Optionally attached to a specific Session — session-less TrainerNotes hold general client context (e.g. an injury history note that isn't tied to one class). The authoring Trainer can read, edit, and delete their own TrainerNotes. Admins can read every TrainerNote about every Client. Clients **never** see TrainerNotes — if a future product need calls for client-visible observations, that is a new concept and a new domain term, not a flag on this one.
> _Avoid_: "Note" alone, "comment", "client log".

Two consequences:

- The audience is now **authoring Trainer + all Admins**, full stop.
- The word **TrainerNote** is the canonical term in prose. The word "Note" alone overloads with `pause.reason`, the admin's `editForm.notes` field, and commit notes.

## Scope

### In scope

**Add to admin app:**

- Fourth pill `Beleške` on the admin client-detail screen, alongside Pregled / Paketi / Treninzi. The inner pill bar; the outer admin tab bar (Pregled / Katalog / Klijenti / Naplata / Izveštaji) is untouched.
- New screen rendered under that pill: paginated list of every TrainerNote about this Client, across all trainers, newest first, with trainer attribution per row.
- Long-press on a row opens an action sheet with `Delete` and `Copy text`. Delete prompts confirm, then calls the existing `DELETE /api/trainer-notes/:id`. No edit affordance.

**Remove from client app:**

- "From your trainer" section on the client home (`(client)/index.tsx`).
- "Training history" section row and `totalNotes`/`thisMonthBookings` stat columns on the client profile (`(client)/profile/index.tsx`).
- The entire client history route (`(client)/profile/history.tsx`).
- All related i18n keys that are no longer referenced.
- The `trainerNotesQueries.list()` and `useQuery(trainerNotesQueries.list())` calls on these surfaces, and the related cache invalidation on pull-to-refresh.

**Backend:**

- `GET /api/trainer-notes` — drop `CLIENT` from the role guard. Clients no longer have a legitimate caller for this endpoint.
- `POST /api/trainer-notes` — remove the `createSystemNotification(profile.userId, TRAINER_NOTE, …)` call. Trainers writing a note no longer pings the client.

**Other client-profile cleanup forced by losing the notes query:**

- `memberSinceYear` on the profile hero currently derives from the oldest note's `createdAt`. Switch to `meQuery.data.user.createdAt`. This is more honest regardless of this work — a client with no notes today silently shows "MEMBER SINCE <current year>".
- The editorial stat strip on the profile (`totalNotes` / `thisMonthBookings` / `activePackages`) collapses. `totalNotes` is a vanity metric; `thisMonthBookings` is mis-named (it counts notes created this month, not bookings) and also loses its data source. Drop the strip — do not introduce a new "sessions attended" stat to backfill the layout. If we want such a stat later it is its own product call.

### Explicitly out of scope

- **Edit affordance for admin.** Admins can read every note and delete any note. They cannot edit — rewriting another person's words puts the admin's text under the trainer's name in the audit trail, and we have no `editedByUserId` / `editedAt` columns to record that honestly. If admins need this later, a schema change comes first.
- **Filter chips by trainer** on the admin Beleške list. Flat-by-date for now. Add filters when an admin asks for them.
- **Admin-targeted "trainer wrote a note" notification.** Trainer notes are passive context, not a work queue. Adding a per-note notification would dull the work-queue notifications admins already have (`BIRTHDAY_ADMIN_PROMPT`, `MINOR_PAPER_NEEDED`, `BOOKING_CANCELED_ADMIN`, `RESERVATION_UNBACKED_ATTENDANCE`). Cheap to add later if usage shows admins want push for this.
- **Migrating existing `TRAINER_NOTE` notification rows out of clients' inboxes.** Already-delivered rows in the `NotificationLog` table decay naturally as users dismiss them. The enum value, the i18n key, and the message template stay so historical rows still render.
- **Schema changes.** No table changes, no enum changes, no migration.

## Architecture

### Admin Beleške pill

Added to the existing `ClientDetailTab` union (`pregled | paketi | treninzi → + beleske`) in `apps/mobile/components/admin/client-detail-tab-bar.tsx`. The pill bar inside the client detail screen is single-mount; tab state is local React state, identical to the existing three pills.

The pill content is a new `BeleskeTab` component, kept inside `components/admin/client-detail.tsx` next to `PregledTab`, `PaketiTab`, `TreninziTab` to match the existing pattern. If `client-detail.tsx` grows past comfort with the addition, extract `BeleskeTab` to its own file in `components/admin/`.

Data plumbing:

- `useInfiniteQuery(trainerNotesQueries.listInfinite({ clientProfileIds: [client.id] }))` — `client.id` in this component's scope already maps to the `ClientProfile.id` (used the same way at L194 and L535 today). The factory already exists; this is the first non-trainer-own caller.
- Render via `<PaginatedList>` (the shared `LegendList` + `useInfiniteQuery` wrapper used on Klijenti, Treninzi, Active Assignments, the assign-package picker, and Istorija treninga). Page size = server default (30, no `take` override).
- `onLongPress` per row opens an `AppSheet` with `Delete` (calls `trainerNotesQueries.delete()` mutation, invalidates the infinite query) and `Copy text` (writes `note.note` to clipboard via `expo-clipboard`).

Row layout: `note.note` as the body; `trainer.fullName · D.M.YYYY.` as the subtitle. Session link is hidden — admins don't need to deep-link into the session from here, and showing it adds noise for the cross-trainer reader.

Empty state: "Nema beleški za ovog klijenta." / "No notes for this client."

### Removing client surfaces

Three files lose their notes usage:

- `apps/mobile/app/(client)/index.tsx` — drop the "Trainer notes" section (~L1101–L1124), drop the `notesQuery` declaration and `notes` derivation (~L797, L808), drop `trainer-notes` from the pull-to-refresh `invalidateQueries`, drop the imports of `trainerNotesQueries` / `TrainerNote` and the `NoteRow` component (defined in this file ~L697 and used only here).
- `apps/mobile/app/(client)/profile/index.tsx` — drop the entire "ISTORIJA TRENINGA" section (~L347–L380), drop the editorial stat strip (~L223–L255), drop the `notesQuery` / `notes` / `totalNotes` / `thisMonthBookings` derivations (~L76–L89), drop `trainer-notes` from pull-to-refresh, fix `memberSinceYear` to read from `meQuery.data.user.createdAt`.
- `apps/mobile/app/(client)/profile/history.tsx` — delete the file. Expo Router auto-removes the route.

i18n cleanup (delete keys, both `en.json` and `sr.json`):

- `client.profileTab.trainingHistory`
- `client.profileTab.totalNotes`
- `client.profileTab.thisMonth`
- `client.profileTab.notesCount`
- `client.history.noNotes`
- `client.history.error`
- `client.home.fromYourTrainer`
- `client.home.trainer` (used only by the `NoteRow` we're removing)

### Backend role guard tightening

`apps/mobile/app/api/trainer-notes/+api.ts`:

- `GET`: change `requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT])` to `[UserRole.ADMIN, UserRole.TRAINER]`. Remove the `guard.user.role === UserRole.CLIENT` branch from the `where` ternary (the branch becomes unreachable). Defense-in-depth: even if a stale client build calls the endpoint, it gets a 403, not their notes.
- `POST`: delete the `void createSystemNotification(profile.userId, NOTIFICATION_MESSAGE_KEYS.TRAINER_NOTE, "TRAINER_NOTE", {...})` block. Drop the related imports if no longer used in the file.

`PATCH /api/trainer-notes/:id` and `DELETE /api/trainer-notes/:id` already gate ADMIN + TRAINER, with trainers scoped to their own notes. Admin delete already works at the API level. No changes there.

### What stays untouched

- The `TRAINER_NOTE` enum value in `NotificationType`. Already-delivered rows in client inboxes will still render with the existing title/body strings — pulling the enum mid-flight would crash the inbox renderer on existing rows.
- `NOTIFICATION_MESSAGE_KEYS.TRAINER_NOTE` and the bilingual message template in `packages/i18n/src/notification-messages.ts`. Same reason.
- The trainer-facing `(trainer)/notes.tsx` screen and `trainerNotesQueries.create / update / delete` mutations. Trainer workflow is unchanged.
- The Prisma `TrainerNote` model and indexes.

## Data flow

```
Trainer writes a note via (trainer)/notes
  → POST /api/trainer-notes
    → DB insert
    → (was: client notification)  ← REMOVED
    → return note

Admin opens client-detail → Beleške pill
  → useInfiniteQuery(trainerNotesQueries.listInfinite({ clientProfileIds: [id] }))
    → GET /api/trainer-notes?clientProfileIds=<id>&cursor=…&take=30
    → server: ADMIN role → no trainerUserId filter → all notes for that client
    → return { notes, nextCursor }
  → PaginatedList renders, onEndReached fetches next page

Admin long-presses a note → AppSheet { Delete, Copy text }
  → Delete → confirm → trainerNotesQueries.delete() mutation
    → DELETE /api/trainer-notes/:id
    → onSuccess: invalidate ["trainer-notes"] queryKey
```

## Error handling

- **Empty client (no notes):** EmptyState in the Beleške pill. No error.
- **Admin delete races trainer edit:** server returns the latest row state; we invalidate and refetch. The admin sees the trainer's newer text after refetch and can re-decide. Acceptable.
- **Stale client build calls `GET /api/trainer-notes`:** 403 from the tightened role guard. The mobile build will log a 403 and render the empty state where the notes used to be. After the matching mobile release ships, all real clients are on the new build. No client-side handling needed beyond what's already there for failed queries.
- **Trainer notes screen unchanged:** all the existing trainer-side handling still applies.

## Testing

Three layers, scaled to what each tests well.

### Unit / component

- `BeleskeTab` renders rows in newest-first order with trainer attribution.
- Long-press opens the action sheet; `Delete` triggers the mutation; `Copy text` calls `Clipboard.setStringAsync` with `note.note`.
- Empty state renders when the infinite query resolves to zero notes.
- Error state renders when the infinite query throws.

### Integration (Vitest + real DB, `baza_app_test`)

- `GET /api/trainer-notes` as CLIENT returns 403.
- `GET /api/trainer-notes` as ADMIN with `clientProfileIds=<id>` returns notes from multiple trainers for that client, newest first.
- `POST /api/trainer-notes` as TRAINER no longer creates a `NotificationLog` row of type `TRAINER_NOTE` for the client. (Asserts the row count is unchanged for the client after the trainer writes a note.)
- `DELETE /api/trainer-notes/:id` as ADMIN succeeds on any trainer's note. (Already supported; covered by existing tests — verify no regression.)

### E2E (Playwright)

- Admin: navigate to a client with seeded notes from two trainers → click `Beleške` pill → see both trainers' notes interleaved by date → long-press a note → `Delete` → confirm → note disappears.
- Client: navigate to home → no "From your trainer" section. Navigate to profile → no "Training history" row, no notes stat columns, hero shows `MEMBER SINCE <user.createdAt year>`.

Anchor time: pin via the existing `TEST_ANCHOR_TIME` mechanism so seeded note `createdAt` values render predictable dates in assertions.

## Open questions

None blocking. Two things deferred:

- Filter-by-trainer on the admin Beleške list. Add when an admin asks. Cost is modest: extend `trainerNotesQuerySchema` to accept a `trainerUserIds` param, merge it into the `where` clause for ADMIN callers in `GET /api/trainer-notes`, thread the param through the factory, and add a chip row above `PaginatedList` that composes the same way the Klijenti screen's chips do. Not free, but contained.
- Admin push notification when a trainer writes a note. Add when an admin asks. Implementation is a one-line `createSystemNotification(adminUserId, …)` inside the same `POST` handler.

## Notes on ADR

This change is *not* hard to reverse — the data is untouched, the API is untouched, the trainer workflow is untouched, and clients can be re-shown notes by reverting two files and one role guard. No ADR. If we later decide on a client-visible-observations concept (the future need flagged in the `CONTEXT.md` update), *that* warrants an ADR — it's a real domain addition with real alternatives.
