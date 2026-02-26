import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

/**
 * Best-effort push token deactivation before ending the auth session.
 */
export async function signOutWithPushCleanup() {
  try {
    await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/notifications/push-token`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Ignore cleanup errors and continue with sign-out.
  }

  const result = await authClient.signOut();
  if (result.error) {
    throw new Error(result.error.message || "Sign-out failed");
  }
}
