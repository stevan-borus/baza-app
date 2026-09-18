/**
 * Unit tests for `subscribeFocusToAppState`.
 *
 * On React Native there is no window `focus` event, so TanStack's default
 * focus manager never fires and `refetchOnWindowFocus` is dead: foregrounding
 * the app refetched nothing. This helper bridges RN's AppState to the focus
 * manager, which is what makes a backgrounded-then-reopened app pull the new
 * notifications instead of showing the list it had before.
 */
import { describe, expect, it, vi } from "vitest";

// react-native's entry is Flow source; the node-env unit project can't parse
// it. Only `AppState` (as the default arg) and `Platform` are touched here.
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const { subscribeFocusToAppState, shouldBridgeAppStateFocus } = await import(
  "@/lib/query-focus"
);

type Handler = (state: string) => void;

function makeFakeAppState() {
  const handlers = new Set<Handler>();
  const remove = vi.fn(() => {
    handlers.clear();
  });
  return {
    handlers,
    remove,
    appState: {
      addEventListener(event: string, handler: Handler) {
        if (event === "change") handlers.add(handler);
        return { remove };
      },
    },
    emit(state: string) {
      for (const handler of handlers) handler(state);
    },
  };
}

describe("shouldBridgeAppStateFocus", () => {
  it("bridges on native, where there is no window focus event", () => {
    expect(shouldBridgeAppStateFocus()).toBe(true);
  });
});

describe("subscribeFocusToAppState", () => {
  it("reports focused when the app becomes active", () => {
    const fake = makeFakeAppState();
    const setFocused = vi.fn();

    subscribeFocusToAppState(setFocused, fake.appState);
    fake.emit("active");

    expect(setFocused).toHaveBeenCalledWith(true);
  });

  it("reports unfocused for background and inactive", () => {
    const fake = makeFakeAppState();
    const setFocused = vi.fn();

    subscribeFocusToAppState(setFocused, fake.appState);
    fake.emit("background");
    fake.emit("inactive");

    expect(setFocused).toHaveBeenNthCalledWith(1, false);
    expect(setFocused).toHaveBeenNthCalledWith(2, false);
  });

  it("removes the AppState listener when unsubscribed", () => {
    const fake = makeFakeAppState();
    const setFocused = vi.fn();

    const unsubscribe = subscribeFocusToAppState(setFocused, fake.appState);
    unsubscribe();

    expect(fake.remove).toHaveBeenCalled();
    fake.emit("active");
    expect(setFocused).not.toHaveBeenCalled();
  });
});
