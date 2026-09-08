import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Apply a mutation's result to a list cache so the list never renders a state
 * that predates the write.
 *
 * A bare `setQueryData` loses the write two ways. On a cold cache there is no
 * list to splice into and the row is dropped. On either cache a fetch already
 * in flight resolves AFTER the splice — `Query.fetch()` calls `setData` only
 * when its retryer settles — and replaces the spliced list with the server's
 * pre-write answer. Both branches below deal with that in-flight fetch, but
 * they cancel it in opposite ways, and the difference is load-bearing.
 *
 * Cold: cancel silently, then invalidate and await. Silent is required twice
 * over. It skips the state revert, so the screen stays on its skeleton instead
 * of flashing an empty list; and it is the only way the invalidate starts a
 * replacement fetch at all, because `fetch()` cancels and restarts an in-flight
 * query only when that query already holds data — a cold one would otherwise
 * re-await the same pre-write promise. Nothing is seeded: a one-row list is not
 * a state worth showing, and awaiting the refetch means the mutation settles
 * only once the real post-write list has landed.
 *
 * Warm: splice FIRST, then cancel with the default `revert: true`. Order is the
 * whole trick. A manual `setQueryData` sets the query's revert target to the
 * state it just wrote, so the revert that `onCancel` performs restores the
 * SPLICED list and marks it idle — the in-flight response is discarded and the
 * query is left clean. Cancelling first would instead revert to the pre-write
 * list, and cancelling silently would leave `fetchStatus: "fetching"` forever
 * with no request behind it (a silent CancelledError returns the retryer
 * promise without dispatching), which keeps every refresh indicator spinning.
 * With nothing in flight the cancel is a no-op, so an idle query is untouched.
 */
export async function writeThroughList<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (prev: TData) => TData,
): Promise<void> {
  const prev = queryClient.getQueryData<TData>(queryKey);

  if (prev === undefined) {
    await queryClient.getQueryCache().find({ queryKey })?.cancel({ silent: true });
    await queryClient.invalidateQueries({ queryKey });
    return;
  }

  queryClient.setQueryData<TData>(queryKey, (current) =>
    current === undefined ? current : updater(current),
  );
  await queryClient.cancelQueries({ queryKey });
}
