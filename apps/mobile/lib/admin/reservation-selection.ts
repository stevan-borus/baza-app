/**
 * Reservation-mode selection state machine — pure, renderer-free.
 *
 * Owns the selection behavior of the admin reservation screen
 * (`components/admin/reservation-mode.tsx`): mode (reserve | cancel), the
 * two selection sets, the ClassType filter chip, tap-to-toggle with the
 * unselectable rules, and pattern-overlay merging. The component holds a
 * state value via useState and renders from it; every transition lives
 * here so it is assertable in Vitest without a React tree.
 */
import { expandPattern, type PatternInput } from "@/lib/reservation-pattern";

export type ReservationModeKind = "reserve" | "cancel";

export type ReservationSelectionState = {
  readonly mode: ReservationModeKind;
  readonly selectedSessionIds: ReadonlySet<string>;
  readonly selectedBookingIds: ReadonlySet<string>;
  /** ClassType name filtering the visible list; "" means "all". */
  readonly classTypeFilter: string;
};

/** The slice of an availability session the selection rules care about. */
export type SelectableSession = {
  id: string;
  startsAt: Date;
  availableSlots: number;
};

/** Ambient facts the transitions need but don't own. */
export type SelectionContext = {
  /** Current instant — pass `nowMs()` from `@/lib/now`. */
  nowMs: number;
  /** Session ids the bound client already has an active booking on. */
  alreadyBookedSessionIds: ReadonlySet<string>;
};

export function createInitialState(): ReservationSelectionState {
  return {
    mode: "reserve",
    selectedSessionIds: new Set(),
    selectedBookingIds: new Set(),
    classTypeFilter: "",
  };
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
export function toggleSession(
  state: ReservationSelectionState,
  session: SelectableSession,
  ctx: SelectionContext,
): ReservationSelectionState {
  if (!classifySession(session, ctx).selectable) return state;
  const next = new Set(state.selectedSessionIds);
  if (next.has(session.id)) next.delete(session.id);
  else next.add(session.id);
  return { ...state, selectedSessionIds: next };
}

/**
 * Switch reserve ↔ cancel. Both selection sets reset (a reserve selection
 * has no meaning in cancel mode and vice versa); the ClassType filter
 * survives because it's a view preference, not a selection.
 */
export function switchMode(
  state: ReservationSelectionState,
  mode: ReservationModeKind,
): ReservationSelectionState {
  return {
    ...state,
    mode,
    selectedSessionIds: new Set(),
    selectedBookingIds: new Set(),
  };
}

/** Set the ClassType chip ("" = all). Filtering never destroys selections. */
export function setClassTypeFilter(
  state: ReservationSelectionState,
  classTypeFilter: string,
): ReservationSelectionState {
  return { ...state, classTypeFilter };
}

/**
 * Pattern overlay — expand a weekly/biweekly pattern over the loaded
 * sessions and merge the matches into the SAME selection set tap-selection
 * feeds. Matches on sessions the client already booked are skipped so the
 * selected count never disagrees with the selectable cards (the server's
 * `skippedAlreadyBooked` check stays as defence-in-depth).
 */
export function applyPattern(
  state: ReservationSelectionState,
  sessions: readonly SelectableSession[],
  input: PatternInput,
  ctx: SelectionContext,
): ReservationSelectionState {
  const matched = expandPattern([...sessions], input);
  const next = new Set(state.selectedSessionIds);
  for (const id of matched) {
    if (ctx.alreadyBookedSessionIds.has(id)) continue;
    next.add(id);
  }
  return { ...state, selectedSessionIds: next };
}

/**
 * Clear both selection sets — used when the bound client changes/clears
 * (a selection made for one client must not leak onto another). Mode and
 * filter stay.
 */
export function resetSelections(
  state: ReservationSelectionState,
): ReservationSelectionState {
  return { ...state, selectedSessionIds: new Set(), selectedBookingIds: new Set() };
}

/** Toolbar "Poništi" — clears the selection belonging to the current mode. */
export function clearActiveSelection(
  state: ReservationSelectionState,
): ReservationSelectionState {
  return state.mode === "reserve"
    ? { ...state, selectedSessionIds: new Set() }
    : { ...state, selectedBookingIds: new Set() };
}

/** Tap-toggle a booking card in cancel mode. Any visible booking toggles. */
export function toggleBooking(
  state: ReservationSelectionState,
  bookingId: string,
): ReservationSelectionState {
  const next = new Set(state.selectedBookingIds);
  if (next.has(bookingId)) next.delete(bookingId);
  else next.add(bookingId);
  return { ...state, selectedBookingIds: next };
}
