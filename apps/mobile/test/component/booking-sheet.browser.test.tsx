/**
 * BookingSheet branch tests — Vitest Browser Mode (real Chromium, real
 * react-native-web rendering, real i18n with the shipped Serbian copy).
 *
 * These cover the sheet's client-side state machine: which action block a
 * session renders given its availability flags. The server-side computation
 * of those flags is covered by test/integration/availability-renewal-flags,
 * and the full wiring (server → row → sheet) by e2e.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { BookingSheet } from "@/components/client/booking-sheet";
import type { AvailabilitySession } from "@baza/types/scheduling";

const HOUR = 60 * 60 * 1000;

/** A bookable future Reformer session; override per test. */
function makeSession(
  overrides: Partial<AvailabilitySession> = {},
): AvailabilitySession {
  const startsAt = new Date(Date.now() + 24 * HOUR);
  return {
    id: "session-1",
    capacity: 6,
    startsAt,
    endsAt: new Date(startsAt.getTime() + HOUR),
    classTypeName: "Reformer pilates",
    roomName: "Sala 1",
    trainerName: "Trainer Reformer Lead",
    bookedCount: 3,
    waitlistCount: 0,
    availableSlots: 3,
    lateCancelHours: 8,
    ...overrides,
  };
}

const noop = () => {};

function renderSheet(props: Partial<React.ComponentProps<typeof BookingSheet>> = {}) {
  return render(
    <BookingSheet
      session={makeSession()}
      onClose={noop}
      onBook={noop}
      onCancel={noop}
      onLeaveWaitlist={noop}
      pending={false}
      successState={null}
      errorCode={null}
      {...props}
    />,
  );
}

describe("BookingSheet renewal locks", () => {
  it("RENEW lock shows the renewal message and no book/waitlist actions", async () => {
    const screen = renderSheet({
      session: makeSession({ bookable: false, lockReason: "RENEW" }),
    });

    const message = await screen.findByTestId("booking-renewal-message");
    expect(message.textContent).toContain(
      "Javite nam se da obnovite paket",
    );
    expect(screen.queryByTestId("booking-book-button")).toBeNull();
    expect(screen.queryByTestId("booking-waitlist-button")).toBeNull();
  });

  it("PAUSED lock explains the pause instead of asking to renew", async () => {
    const screen = renderSheet({
      session: makeSession({ bookable: false, lockReason: "PAUSED" }),
    });

    const message = await screen.findByTestId("booking-paused-message");
    expect(message.textContent).toContain("trenutno pauziran");
    expect(screen.queryByTestId("booking-renewal-message")).toBeNull();
    expect(screen.queryByTestId("booking-book-button")).toBeNull();
  });

  it("NOT_STARTED lock explains the package hasn't begun", async () => {
    const screen = renderSheet({
      session: makeSession({ bookable: false, lockReason: "NOT_STARTED" }),
    });

    const message = await screen.findByTestId("booking-not-started-message");
    expect(message.textContent).toContain("još nije počeo");
    expect(screen.queryByTestId("booking-renewal-message")).toBeNull();
    expect(screen.queryByTestId("booking-book-button")).toBeNull();
  });

  it("FULLY_HELD lock tells the client their holds are using every slot", async () => {
    const screen = renderSheet({
      session: makeSession({ bookable: false, lockReason: "FULLY_HELD" }),
    });

    const message = await screen.findByTestId("booking-fully-held-message");
    expect(message.textContent).toContain("sve dostupne termine");
    expect(screen.queryByTestId("booking-book-button")).toBeNull();
  });

  it("a missing lockReason on a locked session falls back to the renewal message", async () => {
    const screen = renderSheet({
      session: makeSession({ bookable: false }),
    });

    await screen.findByTestId("booking-renewal-message");
  });

  it("EMPTY_CUTOFF lock names the cutoff window the studio closed booking in", async () => {
    const screen = renderSheet({
      session: makeSession({
        bookable: false,
        lockReason: "EMPTY_CUTOFF",
        emptyBookingCutoffHours: 4,
      }),
    });

    const message = await screen.findByTestId("booking-empty-cutoff-message");
    expect(message.textContent).toContain("4");
    expect(message.textContent).toContain("niko nije zakazao");
    expect(screen.queryByTestId("booking-book-button")).toBeNull();
    expect(screen.queryByTestId("booking-renewal-message")).toBeNull();
  });

  it("EMPTY_CUTOFF copy uses the class type's own window, not a fixed 4h", async () => {
    const screen = renderSheet({
      session: makeSession({
        bookable: false,
        lockReason: "EMPTY_CUTOFF",
        emptyBookingCutoffHours: 6,
      }),
    });

    const message = await screen.findByTestId("booking-empty-cutoff-message");
    expect(message.textContent).toContain("6");
    expect(message.textContent).not.toContain("4");
  });

  it("a waitlisted client sees LEAVE, not the lock message, even when FULLY_HELD", async () => {
    // The client's own waitlist hold can BE what makes the session FULLY_HELD;
    // the lock must not trap the one person who needs the leave button.
    const screen = renderSheet({
      session: makeSession({
        bookable: false,
        lockReason: "FULLY_HELD",
        isWaitlistedByMe: true,
        availableSlots: 0,
        bookedCount: 6,
        waitlistCount: 1,
      }),
    });

    await screen.findByTestId("booking-leave-waitlist-button");
    expect(screen.queryByTestId("booking-fully-held-message")).toBeNull();
  });
});

describe("BookingSheet intermediate badge", () => {
  it("shows the intermediate badge when the session is marked", async () => {
    const screen = renderSheet({
      session: makeSession({ isIntermediate: true }),
    });
    await screen.findByTestId("intermediate-badge");
  });

  it("spells the mark out — the sheet doubles as the legend", async () => {
    // Dense rows show the bare ★; the sheet is the one surface where the tap
    // already landed, so the mark expands to glyph + word here.
    const screen = renderSheet({
      session: makeSession({ isIntermediate: true }),
    });
    const badge = await screen.findByTestId("intermediate-badge");
    expect(badge.textContent).toContain("★");
    expect(badge.textContent).toContain("Intermediate");
  });

  it("shows no intermediate badge when the session is unmarked", async () => {
    const screen = renderSheet({
      session: makeSession({ isIntermediate: false }),
    });
    // The book button is enough to know the sheet mounted for an unmarked
    // session; the badge must be absent.
    await screen.findByTestId("booking-book-button");
    expect(screen.queryByTestId("intermediate-badge")).toBeNull();
  });
});

describe("BookingSheet booking flow", () => {
  it("book → two-step confirm → onBook fires with the session id", async () => {
    const onBook = vi.fn();
    const screen = renderSheet({ onBook });

    fireEvent.click(await screen.findByTestId("booking-book-button"));
    expect(screen.getByText("Potvrdite rezervaciju?")).toBeTruthy();
    expect(onBook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("booking-confirm-book-button"));
    expect(onBook).toHaveBeenCalledWith("session-1");
  });

  it("back from the confirm step returns to the book button without booking", async () => {
    const onBook = vi.fn();
    const screen = renderSheet({ onBook });

    fireEvent.click(await screen.findByTestId("booking-book-button"));
    fireEvent.click(screen.getByTestId("booking-confirm-book-back-button"));

    await screen.findByTestId("booking-book-button");
    expect(screen.queryByTestId("booking-confirm-book-button")).toBeNull();
    expect(onBook).not.toHaveBeenCalled();
  });

  it("the last bookable slot adds the spend-your-last-session warning to confirm", async () => {
    const screen = renderSheet({
      session: makeSession({ lastBookableSlot: true }),
    });

    fireEvent.click(await screen.findByTestId("booking-book-button"));
    const warning = screen.getByTestId("booking-last-slot-warning");
    expect(warning.textContent).toContain("poslednji termin iz paketa");
  });
});

describe("BookingSheet cancel flow", () => {
  const bookedFuture = () => makeSession({ isBookedByMe: true });

  it("a booked future session offers cancel; confirming fires onCancel", async () => {
    const onCancel = vi.fn();
    const screen = renderSheet({ session: bookedFuture(), onCancel });

    fireEvent.click(await screen.findByTestId("booking-cancel-button"));
    fireEvent.click(screen.getByTestId("booking-confirm-cancel-button"));
    expect(onCancel).toHaveBeenCalledWith("session-1");
  });

  it("an early cancel shows the neutral warning, not the forfeit one", async () => {
    // startsAt is 24h out and lateCancelHours is 8 — outside the window.
    const screen = renderSheet({ session: bookedFuture() });

    fireEvent.click(await screen.findByTestId("booking-cancel-button"));
    const warning = screen.getByTestId("booking-cancel-warning");
    expect(warning.textContent).toBe(
      "Da li ste sigurni da želite da otkažete?",
    );
  });

  it("a cancel inside the late window warns that a session is forfeited", async () => {
    const screen = renderSheet({
      session: makeSession({
        isBookedByMe: true,
        startsAt: new Date(Date.now() + 2 * HOUR),
        endsAt: new Date(Date.now() + 3 * HOUR),
        lateCancelHours: 8,
      }),
    });

    fireEvent.click(await screen.findByTestId("booking-cancel-button"));
    const warning = screen.getByTestId("booking-cancel-warning");
    expect(warning.textContent).toContain(
      "Otkazivanje manje od 8 sati pre termina",
    );
  });

  it("a booked session that already started shows past-state, no cancel button", async () => {
    const screen = renderSheet({
      session: makeSession({
        isBookedByMe: true,
        startsAt: new Date(Date.now() - 2 * HOUR),
        endsAt: new Date(Date.now() - HOUR),
      }),
    });

    await screen.findByTestId("booking-past-state");
    expect(screen.queryByTestId("booking-cancel-button")).toBeNull();
  });

  it("an unbooked past session shows past-state, no book button", async () => {
    const screen = renderSheet({
      session: makeSession({
        startsAt: new Date(Date.now() - 2 * HOUR),
        endsAt: new Date(Date.now() - HOUR),
      }),
    });

    await screen.findByTestId("booking-past-state");
    expect(screen.queryByTestId("booking-book-button")).toBeNull();
  });
});

describe("BookingSheet waitlist flow", () => {
  const fullSession = () =>
    makeSession({ availableSlots: 0, bookedCount: 6, waitlistCount: 0 });

  it("a full session offers join-waitlist with the reserves-a-session note", async () => {
    const onBook = vi.fn();
    const screen = renderSheet({ session: fullSession(), onBook });

    const join = await screen.findByTestId("booking-waitlist-button");
    const note = screen.getByTestId("booking-waitlist-reserve-note");
    expect(note.textContent).toContain("rezervišete jedan termin iz paketa");
    expect(screen.queryByTestId("booking-waitlist-last-slot-note")).toBeNull();

    // Joining the waitlist is single-step (no confirm interstitial).
    fireEvent.click(join);
    expect(onBook).toHaveBeenCalledWith("session-1");
  });

  it("joining with the last package slot adds the renew-to-book-more note", async () => {
    const screen = renderSheet({
      session: makeSession({
        availableSlots: 0,
        bookedCount: 6,
        lastBookableSlot: true,
      }),
    });

    const note = await screen.findByTestId("booking-waitlist-last-slot-note");
    expect(note.textContent).toContain("poslednji termin iz paketa");
  });

  it("leave-waitlist is two-step and fires onLeaveWaitlist on confirm", async () => {
    const onLeaveWaitlist = vi.fn();
    const screen = renderSheet({
      session: makeSession({
        availableSlots: 0,
        bookedCount: 6,
        waitlistCount: 1,
        isWaitlistedByMe: true,
      }),
      onLeaveWaitlist,
    });

    fireEvent.click(await screen.findByTestId("booking-leave-waitlist-button"));
    expect(screen.getByText("Napusti listu čekanja?")).toBeTruthy();
    expect(onLeaveWaitlist).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByTestId("booking-confirm-leave-waitlist-button"),
    );
    expect(onLeaveWaitlist).toHaveBeenCalledWith("session-1");
  });
});

describe("BookingSheet result states", () => {
  it.each([
    ["BOOKED", "Uspešno zakazano!"],
    ["WAITLISTED", "Dodati ste na listu čekanja"],
    ["CANCELED", "Termin je otkazan"],
    ["LEFT_WAITLIST", "Napustili ste listu čekanja"],
  ] as const)("successState %s renders its message", async (state, copy) => {
    const screen = renderSheet({ successState: state });

    const message = await screen.findByTestId("booking-success-message");
    expect(message.textContent).toBe(copy);
  });

  it("a late cancel's result says a session was forfeited", async () => {
    const screen = renderSheet({
      session: makeSession({
        isBookedByMe: true,
        startsAt: new Date(Date.now() + 2 * HOUR),
        endsAt: new Date(Date.now() + 3 * HOUR),
        lateCancelHours: 8,
      }),
      successState: "CANCELED",
    });

    const message = await screen.findByTestId("booking-success-message");
    expect(message.textContent).toContain("jedan termin je potrošen");
  });

  it("the last-slot warning survives the availability refetch that clears the flag", async () => {
    // Booking the last slot flips lastBookableSlot to false on the refetch
    // that lands WITH the success — the warning must come from the snapshot
    // taken at confirm time, or the client never sees it.
    const onBook = vi.fn();
    const first = makeSession({ lastBookableSlot: true });
    const screen = renderSheet({ session: first, onBook });

    fireEvent.click(await screen.findByTestId("booking-book-button"));
    fireEvent.click(screen.getByTestId("booking-confirm-book-button"));

    screen.rerender(
      <BookingSheet
        session={{ ...first, lastBookableSlot: false, availableSlots: 0 }}
        onClose={noop}
        onBook={onBook}
        onCancel={noop}
        onLeaveWaitlist={noop}
        pending={false}
        successState="BOOKED"
        errorCode={null}
      />,
    );

    const warning = await screen.findByTestId(
      "booking-success-last-slot-warning",
    );
    expect(warning.textContent).toContain("poslednji termin iz paketa");
  });

  it("a waitlist-join success restates the reserve note", async () => {
    const screen = renderSheet({
      session: makeSession({ availableSlots: 0, bookedCount: 6 }),
      successState: "WAITLISTED",
    });

    const note = await screen.findByTestId("booking-success-waitlist-note");
    expect(note.textContent).toContain("rezervišete jedan termin iz paketa");
  });

  it.each([
    ["GUARDIAN_VERIFICATION_REQUIRED", "roditelj mora prvo potpisati"],
    ["no_package_for_class", "Nemate aktivan paket"],
    ["PACKAGE_EXHAUSTED", "Nemate više termina u paketu"],
    ["SESSION_IN_PAST", "već prošao"],
    ["EMPTY_SESSION_CUTOFF", "niko nije zakazao"],
    ["SOME_UNKNOWN_CODE", "Akcija zakazivanja nije uspela."],
  ] as const)("errorCode %s renders its copy", async (code, copy) => {
    const screen = renderSheet({ errorCode: code });

    const message = await screen.findByTestId("booking-error-message");
    expect(message.textContent).toContain(copy);
  });
});
