/**
 * confirmSession — the check sign-in runs after the credentials are accepted.
 *
 * Driven by a fake session atom that starts where better-auth's atom is right
 * after sign-in (settled, no session yet) and answers each `refetch` with the
 * next scripted get-session outcome, moving through refetching to settled the
 * way the real atom does. The real atom is never touched, so the auth client
 * module is replaced at its boundary.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({ authClient: {} }));

import { confirmSession, type SessionAtom } from "@/lib/session-auth";

type State = ReturnType<SessionAtom["get"]>;
type Outcome = Pick<State, "data" | "error">;

const SIGNED_IN: Outcome = { data: { session: { id: "s1" } }, error: null };
const NETWORK_DOWN: Outcome = {
  data: null,
  error: { status: undefined },
};
const UNAUTHORIZED: Outcome = { data: null, error: { status: 401 } };

const NO_WAIT = [0, 0, 0];

/** Long enough that a test waiting on one would time out. */
const NEVER = [60_000, 60_000, 60_000];

/**
 * A settled, signed-out session atom that answers each `refetch` with the
 * next scripted outcome (NETWORK_DOWN once the script runs out). Records how
 * many get-session requests it made.
 */
function fakeAtom(refetchOutcomes: Outcome[] = []) {
  const listeners = new Set<(state: State) => void>();
  let requests = 0;
  let state: State;

  function set(next: State) {
    state = next;
    for (const listener of [...listeners]) listener(state);
  }

  async function refetch() {
    requests += 1;
    set({ ...state, isRefetching: true });
    const outcome = refetchOutcomes.shift() ?? NETWORK_DOWN;
    setTimeout(() =>
      set({ ...state, ...outcome, isPending: false, isRefetching: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  state = {
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch,
  };

  const atom: SessionAtom = {
    get: () => state,
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { atom, requests: () => requests };
}

describe("confirmSession", () => {
  it("confirms on the first get-session, without waiting on a retry delay", async () => {
    const { atom, requests } = fakeAtom([SIGNED_IN]);
    await expect(confirmSession({ atom, retryDelaysMs: NEVER })).resolves.toBe(
      true,
    );
    expect(requests()).toBe(1);
  });

  it("retries a get-session that failed on the network", async () => {
    const { atom, requests } = fakeAtom([NETWORK_DOWN, NETWORK_DOWN, SIGNED_IN]);
    await expect(confirmSession({ atom, retryDelaysMs: NO_WAIT })).resolves.toBe(
      true,
    );
    expect(requests()).toBe(3);
  });

  it("gives up after the last retry when the network stays down", async () => {
    const { atom, requests } = fakeAtom();
    await expect(confirmSession({ atom, retryDelaysMs: NO_WAIT })).resolves.toBe(
      false,
    );
    expect(requests()).toBe(1 + NO_WAIT.length);
  });

  it("does not retry a 401: there is no session to confirm", async () => {
    const { atom, requests } = fakeAtom([UNAUTHORIZED]);
    await expect(confirmSession({ atom, retryDelaysMs: NO_WAIT })).resolves.toBe(
      false,
    );
    expect(requests()).toBe(1);
  });
});
