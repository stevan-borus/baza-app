import { Platform } from "react-native";
import { authClient } from "@/lib/auth-client";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // On web, let the browser handle session cookies via credentials: "include".
  // expo-secure-store (which @better-auth/expo's getCookie() reads from) is
  // a no-op on web, so the manual Cookie header path returns nothing and any
  // authenticated request would 401.
  if (Platform.OS === "web") {
    return fetch(input, { ...init, credentials: "include" });
  }
  const cookie = authClient.getCookie();
  const headers = new Headers(init?.headers);
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  return fetch(input, { ...init, credentials: "omit", headers });
}

// ApiError + throwIfNotOk moved to the react-native-free lib/api-error.ts so
// the request seam (lib/api-request.ts) and node unit tests can use them
// without importing the platform transport. Re-exported here so existing
// `import { ApiError } from "@/lib/api"` call sites keep working.
export { ApiError, throwIfNotOk } from "@/lib/api-error";
