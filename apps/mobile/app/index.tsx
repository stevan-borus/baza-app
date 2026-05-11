import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSessionAuth } from "@/lib/session-auth";
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

  if (session.error || !session.data?.session || !session.role) {
    return <Redirect href="/sign-in" />;
  }
  const role = session.role;

  if (role === "ADMIN") return <Redirect href="/(admin)/pregled" />;
  if (role === "TRAINER") return <Redirect href="/(trainer)" />;
  return <Redirect href="/(client)" />;
}
