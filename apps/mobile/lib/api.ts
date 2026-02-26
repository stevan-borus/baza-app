import { authClient } from "@/lib/auth-client";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const cookie = authClient.getCookie();
  const headers = new Headers(init?.headers);
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  return fetch(input, { ...init, credentials: "omit", headers });
}
