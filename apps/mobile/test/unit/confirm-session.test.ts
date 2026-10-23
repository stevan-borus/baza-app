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
/** An outcome without `data` keeps whatever the atom already holds. */
type Outcome = Partial<Pick<State, "data">> & Pick<State, "error">;

const SIGNED_IN: Outcome = { data: { session: { id: "s1" } }, error: null };
const NETWORK_DOWN: Outcome = {
  data: null,
  error: { status: undefined },
};
const UNAUTHORIZED: Outcome = { data: null, error: { status: 401 } };
/** better-auth's catch on a thrown fetch: `{ data: latest.data, error }`. */
const NETWORK_DOWN_KEEPING_DATA: Outcome = { error: { status: undefined } };
/** What @better-auth/expo hydrates from SecureStore on a cold start. */
const CACHED_SESSION = { session: { id: "previous-user" } };

const NO_WAIT = [0, 0, 0];

/** Long enough that a test waiting on one would time out. */
const NEVER = [60_000, 60_000, 60_000];

/**
 * A settled session atom (signed out unless `initial` says otherwise) that
 * answers each `refetch` with the next scripted outcome (NETWORK_DOWN once
 * the script runs out). Records how many get-session requests it made.
 */
function fakeAtom(
  refetchOutcomes: Outcome[] = [],
  initial: Pick<State, "data" | "error"> = { data: null, error: null },
) {
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
    ...initial,
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

  it("does not confirm cached session data the failed refetch left behind", async () => {
    const attempts = 1 + NO_WAIT.length;
    const { atom, requests } = fakeAtom(
      Array.from({ length: attempts }, () => NETWORK_DOWN_KEEPING_DATA),
      { data: CACHED_SESSION, error: { status: undefined } },
    );
    await expect(confirmSession({ atom, retryDelaysMs: NO_WAIT })).resolves.toBe(
      false,
    );
    expect(requests()).toBe(attempts);
  });

  it("retries past cached data and a network error to a clean session", async () => {
    const { atom, requests } = fakeAtom(
      [NETWORK_DOWN_KEEPING_DATA, SIGNED_IN],
      { data: CACHED_SESSION, error: { status: undefined } },
    );
    await expect(confirmSession({ atom, retryDelaysMs: NO_WAIT })).resolves.toBe(
      true,
    );
    expect(requests()).toBe(2);
  });
});
