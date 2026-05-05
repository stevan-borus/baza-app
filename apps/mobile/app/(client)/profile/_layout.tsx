/**
 * Stack inside the Profile tab. The summary lives at index; long-form
 * sub-pages (training history, etc.) push from the summary.
 *
 * `headerShown: false` everywhere — each screen renders the AppHeader
 * itself so we can swap left/right slots per route.
 */
import { Stack } from "expo-router";

export default function ClientProfileStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
