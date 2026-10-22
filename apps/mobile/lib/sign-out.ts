import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";
import type { WritableSessionAtom } from "@/lib/session-auth";

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

  // A failed refetch keeps the session it already holds, and the guards trust
  // that through network errors, so drop it here (as @better-auth/expo does
  // on native) instead of waiting on the post-sign-out refetch.
  const session: WritableSessionAtom = authClient.$store.atoms.session;
  session.set({ ...session.get(), data: null, error: null, isPending: false });
}
