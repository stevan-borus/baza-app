/**
 * `writeThroughList` must leave a list cache showing the post-write list and
 * nothing else — no dropped row on a cold cache, and no window where an
 * observer renders a settled list that predates the write ("no flash").
 *
 * Each case records EVERY observer notification, so the no-flash claim is
 * checked against the transitions themselves rather than the final data.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { writeThroughList } from "@/lib/queries/write-through-list";

type Transition = {
  data: string[] | undefined;
  isFetching: boolean;
  status: "pending" | "success" | "error";
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A transition an observer could paint as a finished, row-less list. */
function isSettledWithout(t: Transition, row: string) {
  return !t.isFetching && !(t.data ?? []).includes(row);
}

const key = ["write-through", "list"] as const;
const append = (row: string) => (prev: string[]) => [...prev, row];

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

/** Subscribe an observer whose queryFn resolves from a queue of gates. */
function observeGated(gates: { promise: Promise<string[]> }[]) {
  const transitions: Transition[] = [];
  let calls = 0;
  const observer = new QueryObserver<string[]>(client, {
    queryKey: key,
    queryFn: () => gates[calls++]!.promise,
    retry: false,
    staleTime: 0,
  });
  const unsubscribe = observer.subscribe((result) => {
    transitions.push({
      data: result.data,
      isFetching: result.isFetching,
      status: result.status,
    });
  });
  return { transitions, unsubscribe, calls: () => calls };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("writeThroughList — cold cache", () => {
  it("keeps the row when the list's first fetch is in flight with a pre-write answer", async () => {
    const first = deferred<string[]>();
    const replacement = deferred<string[]>();
    const { transitions, unsubscribe, calls } = observeGated([first, replacement]);
    await tick();
    expect(calls()).toBe(1);
    expect(client.getQueryData(key)).toBeUndefined();

    const mark = transitions.length;
    let settled = false;
    const helper = writeThroughList<string[]>(client, key, append("new")).then(() => {
      settled = true;
    });
    await tick();

    // The pre-write response lands while the helper is still working.
    first.resolve(["a", "b"]);
    await tick();
    expect(settled).toBe(false);

    replacement.resolve(["a", "b", "new"]);
    await helper;

    expect(client.getQueryData(key)).toEqual(["a", "b", "new"]);
    // The replacement fetch completed, so nothing is left in flight.
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    const after = transitions.slice(mark);
    // No flash: nothing after the call paints a finished list without the row.
    expect(after.filter((t) => isSettledWithout(t, "new"))).toEqual([]);
    // The pre-write list never reached an observer at all.
    expect(after.map((t) => t.data)).not.toContainEqual(["a", "b"]);
    unsubscribe();
  });

  it("resolves without a subscriber, leaving nothing for the next mount to reuse", async () => {
    // No observer has ever mounted, so no Query object exists to mark stale —
    // `invalidateQueries` finds nothing and there is nothing to find. That is
    // the correct end state: with no cached list, the next mount fetches.
    await expect(
      writeThroughList<string[]>(client, key, append("new")),
    ).resolves.toBeUndefined();
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("splices an unobserved-but-cached list rather than dropping the row", async () => {
    // A list the user has scrolled away from still holds data with no
    // subscriber. The warm path applies regardless of who is watching.
    client.setQueryData(key, ["a"]);

    await writeThroughList<string[]>(client, key, append("new"));

    expect(client.getQueryData(key)).toEqual(["a", "new"]);
  });
});

describe("writeThroughList — warm cache", () => {
  it("survives a stale background refetch resolving after the splice", async () => {
    const first = deferred<string[]>();
    const stale = deferred<string[]>();
    const { transitions, unsubscribe } = observeGated([first, stale]);
    first.resolve(["a"]);
    await tick();
    expect(client.getQueryData(key)).toEqual(["a"]);

    void client.refetchQueries({ queryKey: key });
    await tick();

    const mark = transitions.length;
    await writeThroughList<string[]>(client, key, append("new"));
    stale.resolve(["a"]);
    await tick();

    const after = transitions.slice(mark);
    expect(client.getQueryData(key)).toEqual(["a", "new"]);
    expect(after.filter((t) => isSettledWithout(t, "new"))).toEqual([]);
    // The cancelled fetch must leave the query idle. A silent cancel returns
    // the retryer promise without dispatching, so fetchStatus would stick at
    // "fetching" with no request behind it and every refresh indicator tied to
    // it would spin forever.
    expect(after.at(-1)?.isFetching).toBe(false);
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    unsubscribe();
  });

  it("splices without refetching when nothing is in flight", async () => {
    const first = deferred<string[]>();
    const { unsubscribe, calls } = observeGated([first, deferred<string[]>()]);
    first.resolve(["a"]);
    await tick();
    expect(calls()).toBe(1);

    await writeThroughList<string[]>(client, key, append("new"));

    expect(client.getQueryData(key)).toEqual(["a", "new"]);
    expect(calls()).toBe(1);
    // Cancelling an idle query is a no-op — it must not be left mid-fetch.
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    unsubscribe();
  });

  it("a stale refetch cannot resurrect a row the write deleted", async () => {
    const first = deferred<string[]>();
    const stale = deferred<string[]>();
    const { transitions, unsubscribe } = observeGated([first, stale]);
    first.resolve(["a", "b"]);
    await tick();

    void client.refetchQueries({ queryKey: key });
    await tick();

    const mark = transitions.length;
    await writeThroughList<string[]>(client, key, (prev) => prev.filter((r) => r !== "b"));
    stale.resolve(["a", "b"]);
    await tick();

    const after = transitions.slice(mark);
    expect(client.getQueryData(key)).toEqual(["a"]);
    expect(after.at(-1)?.isFetching).toBe(false);
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    unsubscribe();
  });
});
