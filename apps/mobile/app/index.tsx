import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { getRoleHomeHref, useSessionAuth } from "@/lib/session-auth";
import { ACCENT } from "@/components/ui/tokens";

/**
 * Root index — redirects to the correct role-based route group
 * based on the authenticated user's role, or to sign-in if unauthenticated.
 */
export default function RootIndex() {
  const session = useSessionAuth();

  if (session.isPending) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <Redirect href={getRoleHomeHref(session.isAuthenticated ? session.role : null)} />
  );
}
