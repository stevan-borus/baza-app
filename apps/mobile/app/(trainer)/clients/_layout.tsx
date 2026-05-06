/**
 * Stack inside the trainer Clients tab. The roster lives at index; the
 * per-client profile pushes from a row tap.
 *
 * `headerShown: false` everywhere — each screen renders the AppHeader
 * itself so we can swap left/right slots per route.
 */
import { Stack } from "expo-router";

export default function TrainerClientsStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
