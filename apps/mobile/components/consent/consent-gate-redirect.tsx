import { Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { consentQueries } from "@/lib/queries/consent-queries-factory";
import { ActivityIndicator, View } from "react-native";
import { ACCENT } from "@/components/ui/tokens";

/**
 * Client-side consent gate. Wraps each role-group layout so any authenticated
 * user with pending consent docs is redirected to /consent before the layout
 * renders any tabs. Server middleware enforces the same gate for /api/* calls
 * (defense in depth for direct API access). The middleware matcher patterns
 * /(client)/[...path] etc. do NOT fire for client tab navigation because
 * expo-router strips route-group names from URLs; this component closes that gap.
 *
 * Only redirects on a successful consent-status response with pending items.
 * If the query errors (e.g. 401 during sign-out transition), we fall through to
 * children so the outer Stack.Protected auth guard handles the redirect cleanly.
 */
export function ConsentGateRedirect({ children }: { children: React.ReactNode }) {
  const status = useQuery(consentQueries.status());

  // Loading the first time (no cached data yet) → show a neutral spinner so
  // tabs don't flash before we know whether a redirect is needed.
  if (status.isPending) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  // Successful response with pending docs → gate is active, redirect.
  // Skip redirect while the query is actively refetching (e.g. after signout,
  // when stale data may show pending docs but the session is being torn down —
  // refetching lets the 401 error state clear the stale data cleanly).
  if (status.isSuccess && !status.isFetching && status.data.pending.length > 0) {
    return <Redirect href="/consent" />;
  }

  // Error (e.g. 401 during sign-out), no pending docs, refetching, or gate
  // not active → render the normal tab layout. The outer auth guard handles
  // sign-out navigation.
  return <>{children}</>;
}
