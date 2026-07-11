import { useEffect, useState } from "react";

/**
 * Returns `value` trailing behind by `delayMs` — it only updates once the
 * input has stopped changing for that long. Use it to gate type-to-search
 * network requests: a keystroke burst produces ONE request after the pause,
 * not one per letter.
 *
 * We reach for this over `useDeferredValue` for network-bound search. Deferred
 * only postpones re-renders under render pressure; it still yields a distinct
 * value per keystroke, and each distinct value is a distinct query key, so the
 * API still gets hit on every letter. A real timer collapses the burst.
 *
 * Default 400ms suits a mobile app: thumb typing and autocorrect mean bursts
 * are slower and each request costs more (cellular latency, battery), so a
 * longer settle than a desktop 250–300ms is the right trade.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
