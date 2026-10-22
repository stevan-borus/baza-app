/**
 * Sign-out against a session fetch that was already in flight.
 *
 * A get-session started before sign-out (a foreground refetch, say) can
 * answer after `signOutWithPushCleanup` has cleared the atom, carrying the
 * session the server still had when it replied. better-auth writes that back
 * into the atom, and when the refetch its own sign-out signal starts then
 * fails on the network, the atom keeps it: the user stays "signed in".
 *
 * Runs a real better-auth client whose fetch is scripted: the first
 * get-session is held open until sign-out has finished, and every later one
 * fails on the network. Asserts on the session atom the route guards read.
 */
import { describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => {
  let releaseStale: ((response: Response) => void) | null = null;
  let getSessionCalls = 0;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  async function fetchImpl(
    input: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/sign-out")) return json({ success: true });
    if (url.includes("/get-session")) {
      getSessionCalls += 1;
      if (getSessionCalls === 1) {
        return new Promise<Response>((resolve) => {
          releaseStale = resolve;
        });
      }
      throw new TypeError("Failed to fetch");
    }
    throw new Error(`unexpected request ${url}`);
  }
  return {
    fetchImpl,
    json,
    releaseStale: (response: Response) => releaseStale?.(response),
  };
});

vi.mock("@/lib/auth-client", async () => {
  const { createAuthClient } = await import("better-auth/client");
  return {
    authClient: createAuthClient({
      baseURL: "http://localhost/api/auth",
      fetchOptions: { customFetchImpl: net.fetchImpl },
    }),
  };
});
vi.mock("@/lib/api", () => ({ apiFetch: async () => undefined }));
vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://localhost" },
}));

import { authClient } from "@/lib/auth-client";
import { signOutWithPushCleanup } from "@/lib/sign-out";

const OLD_SESSION = {
  session: {
    id: "session-1",
    userId: "user-1",
    token: "token-1",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  user: { id: "user-1", email: "trainer@example.test", role: "TRAINER" },
};

describe("signOutWithPushCleanup", () => {
  it("does not let a get-session from before sign-out restore the session", async () => {
    const { session, $sessionSignal } = authClient.$store.atoms;
    // Mounting the atom wires better-auth's sign-out signal to a refetch.
    const unmount = session.listen(() => {});
    let signalFired = false;
    const unlistenSignal = $sessionSignal.listen(() => {
      signalFired = true;
    });
    session.set({
      ...session.get(),
      data: OLD_SESSION,
      error: null,
      isPending: false,
      isRefetching: false,
    });

    // A foreground refetch is in flight when the user signs out.
    void session.get().refetch();
    await signOutWithPushCleanup();
    // The server answered that refetch before it deleted the session.
    net.releaseStale(net.json(OLD_SESSION));

    await vi.waitFor(() => {
      expect(signalFired).toBe(true);
      expect(session.get().isRefetching).toBe(false);
    });
    expect(session.get().data).toBeNull();

    unlistenSignal();
    unmount();
  });
});
