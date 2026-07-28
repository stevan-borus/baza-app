/**
 * Reservation-mode selection state machine — pure, renderer-free.
 *
 * Owns the selection behavior of the admin reservation screen
 * (`components/admin/reservation-mode.tsx`): mode (reserve | cancel), the
 * two selection sets, the ClassType filter chip, tap-to-toggle with the
 * unselectable rules, and pattern-overlay merging. The component holds a
 * state value via useState and renders from it; every transition lives
 * here so it is assertable in Vitest without a React tree.
 *
 * The state carries the selected session OBJECTS, not just their ids: the
 * screen never holds more than one month of availability, so anything
 * selected outside the visible month has no other place to live.
 */
import { expandPattern, type PatternInput } from "@/lib/reservation-pattern";

export type ReservationModeKind = "reserve" | "cancel";

/** The slice of an availability session the selection rules care about. */
export type SelectableSession = {
  id: string;
  startsAt: Date;
  availableSlots: number;
};

/**
 * Selection state, generic over the caller's session shape so the sessions it
 * carries keep every field the screen renders (class type, times, capacity)
 * while the rules here only ever read the three in `SelectableSession`.
 */
export type ReservationSelectionState<
  S extends SelectableSession = SelectableSession,
> = {
  readonly mode: ReservationModeKind;
  readonly selectedSessionIds: ReadonlySet<string>;
  /**
   * The selected sessions themselves, keyed by id — NOT derivable from the
   * screen, which only ever holds one month of availability at a time. A
   * session selected in June (by pattern or by paging the week strip) would
   * otherwise disappear from the confirm sheet's count and from the
   * mutation's `sessionIds` the moment the visible month changed back.
   */
  readonly selectedSessionsById: ReadonlyMap<string, S>;
  readonly selectedBookingIds: ReadonlySet<string>;
  /** ClassType name filtering the visible list; "" means "all". */
  readonly classTypeFilter: string;
};

/** Ambient facts the transitions need but don't own. */
export type SelectionContext = {
  /** Current instant — pass `nowMs()` from `@/lib/now`. */
  nowMs: number;
  /** Session ids the bound client already has an active booking on. */
  alreadyBookedSessionIds: ReadonlySet<string>;
};

export function createInitialState<
  S extends SelectableSession = SelectableSession,
>(): ReservationSelectionState<S> {
  return {
    mode: "reserve",
    selectedSessionIds: new Set(),
    selectedSessionsById: new Map(),
    selectedBookingIds: new Set(),
    classTypeFilter: "",
  };
}

/**
 * The selected sessions as a chronologically ordered list — what the confirm
 * sheet counts, breaks down by class type, and turns into the mutation's
 * `sessionIds`. Reads the stored objects, never the visible month's array, so
 * it is complete regardless of where the week strip happens to be parked.
 */
export function selectedSessionList<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
): S[] {
  return [...state.selectedSessionsById.values()].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

/**
 * Distinct, sorted ClassType names for the filter chips — sorted so the
 * chip row stays stable across refetches regardless of session order.
 */
export function distinctClassTypeNames(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

export type SessionClassification = {
  /** Started before "now" — visible but disabled (booking it is meaningless). */
  isPast: boolean;
  /** No available slots — the "0/6" badge already explains why. */
  isFull: boolean;
  /** The bound client holds an active booking — renders as "Već rezervisano". */
  isAlreadyBooked: boolean;
  /** True iff none of the above; the single source of truth for tap-ability. */
  selectable: boolean;
};

/**
 * The unselectable rules, shared by the tap guard and the card rendering
 * (disabled + dim for past/full, success tone for already-booked).
 */
export function classifySession(
  session: SelectableSession,
  ctx: SelectionContext,
): SessionClassification {
  const isPast = session.startsAt.getTime() < ctx.nowMs;
  const isFull = session.availableSlots <= 0;
  const isAlreadyBooked = ctx.alreadyBookedSessionIds.has(session.id);
  return {
    isPast,
    isFull,
    isAlreadyBooked,
    selectable: !isPast && !isFull && !isAlreadyBooked,
  };
}

/**
 * Tap-toggle a session card in reserve mode. Past, full and already-booked
 * sessions are visible but unselectable — the card renders them disabled,
 * and this guard is belt-and-braces.
 */
export function toggleSession<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
  session: S,
  ctx: SelectionContext,
): ReservationSelectionState<S> {
  if (!classifySession(session, ctx).selectable) return state;
  const next = new Set(state.selectedSessionIds);
  const nextById = new Map(state.selectedSessionsById);
  if (next.has(session.id)) {
    next.delete(session.id);
    nextById.delete(session.id);
  } else {
    next.add(session.id);
    nextById.set(session.id, session);
  }
  return { ...state, selectedSessionIds: next, selectedSessionsById: nextById };
}

/**
 * Switch reserve ↔ cancel. Both selection sets reset (a reserve selection
 * has no meaning in cancel mode and vice versa); the ClassType filter
 * survives because it's a view preference, not a selection.
 */
export function switchMode<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
  mode: ReservationModeKind,
): ReservationSelectionState<S> {
  return {
    ...state,
    mode,
    selectedSessionIds: new Set(),
    selectedSessionsById: new Map(),
    selectedBookingIds: new Set(),
  };
}

/** Set the ClassType chip ("" = all). Filtering never destroys selections. */
export function setClassTypeFilter<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
  classTypeFilter: string,
): ReservationSelectionState<S> {
  return { ...state, classTypeFilter };
}

/** The outcome of an `applyPattern` sweep: the new state plus a skip summary. */
export type ApplyPatternResult<S extends SelectableSession = SelectableSession> = {
  /** The merged selection state — feed straight back into the component. */
  state: ReservationSelectionState<S>;
  /** Matched sessions skipped because they are full (capacity reached). */
  skippedFull: number;
  /** Matched sessions skipped because the client already booked them. */
  skippedAlreadyBooked: number;
  /** Sessions newly added to the selection by this sweep. */
  added: number;
};

/**
 * Pattern overlay — expand a weekly/biweekly pattern over the loaded
 * sessions and merge the matches into the SAME selection set tap-selection
 * feeds. A match is skipped (and counted) when the session is already
 * booked OR full: pattern and tap share ONE definition of "full" via
 * `classifySession`, so a pattern sweep can never overfill a class past
 * capacity (tap already refuses full sessions). The returned summary lets
 * the screen tell the admin how many matches were dropped.
 *
 * Past sessions are never reached here — `expandPattern` already drops them.
 *
 * A session that is both full AND already-booked is counted ONLY as
 * `skippedAlreadyBooked` (checked first), never double-counted, so the
 * admin notice's total is exact.
 *
 * `sessions` must cover every month the pattern's range spans — the caller
 * merges them (see `monthKeysForPattern`). A single month's availability
 * caps a 12-week pattern at that month's remaining sessions.
 */
export function applyPattern<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
  sessions: readonly S[],
  input: PatternInput,
  ctx: SelectionContext,
): ApplyPatternResult<S> {
  const matched = expandPattern([...sessions], input);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const next = new Set(state.selectedSessionIds);
  const nextById = new Map(state.selectedSessionsById);
  let skippedFull = 0;
  let skippedAlreadyBooked = 0;
  let added = 0;
  for (const id of matched) {
    const session = byId.get(id);
    // expandPattern only returns ids drawn from `sessions`, so a miss here
    // is impossible — guard for type-safety and skip if it ever happens.
    if (!session) continue;
    const { isFull, isAlreadyBooked } = classifySession(session, ctx);
    if (isAlreadyBooked) {
      skippedAlreadyBooked += 1;
      continue;
    }
    if (isFull) {
      skippedFull += 1;
      continue;
    }
    if (!next.has(id)) added += 1;
    next.add(id);
    nextById.set(id, session);
  }
  return {
    state: { ...state, selectedSessionIds: next, selectedSessionsById: nextById },
    skippedFull,
    skippedAlreadyBooked,
    added,
  };
}

/**
 * Clear both selection sets — used when the bound client changes/clears
 * (a selection made for one client must not leak onto another). Mode and
 * filter stay.
 */
export function resetSelections<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
): ReservationSelectionState<S> {
  return {
    ...state,
    selectedSessionIds: new Set(),
    selectedSessionsById: new Map(),
    selectedBookingIds: new Set(),
  };
}

/** Toolbar "Poništi" — clears the selection belonging to the current mode. */
export function clearActiveSelection<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
): ReservationSelectionState<S> {
  return state.mode === "reserve"
    ? { ...state, selectedSessionIds: new Set(), selectedSessionsById: new Map() }
    : { ...state, selectedBookingIds: new Set() };
}

/** Tap-toggle a booking card in cancel mode. Any visible booking toggles. */
export function toggleBooking<S extends SelectableSession>(
  state: ReservationSelectionState<S>,
  bookingId: string,
): ReservationSelectionState<S> {
  const next = new Set(state.selectedBookingIds);
  if (next.has(bookingId)) next.delete(bookingId);
  else next.add(bookingId);
  return { ...state, selectedBookingIds: next };
}
