import { AppState as RNAppState, Platform } from "react-native";

type AppStateLike = {
  addEventListener: (
    event: "change",
    handler: (state: string) => void,
  ) => { remove: () => void };
};

/**
 * Bridges React Native's AppState to TanStack Query's focus manager.
 *
 * There is no window `focus` event on native, so TanStack's default focus
 * listener never fires and every `refetchOnWindowFocus` is inert — an app
 * reopened from the background keeps showing whatever it had cached. Feeding
 * `active` → focused makes foregrounding refetch stale queries.
 *
 * `appState` is injectable so the mapping can be unit-tested with a fake.
 */
export function subscribeFocusToAppState(
  setFocused: (focused?: boolean) => void,
  appState: AppStateLike = RNAppState as unknown as AppStateLike,
): () => void {
  const subscription = appState.addEventListener("change", (state) => {
    setFocused(state === "active");
  });
  return () => subscription.remove();
}

/** Web keeps TanStack's own window listener, which works there. */
export function shouldBridgeAppStateFocus(): boolean {
  return Platform.OS !== "web";
}
