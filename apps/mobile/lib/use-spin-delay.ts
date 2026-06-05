import { useEffect, useRef, useState } from "react";

/**
 * Avoids spinner flicker. Ported from `spin-delay` (smeijer/spin-delay, MIT) —
 * copied in rather than added as a dependency.
 *
 * Returns true only when `loading` has stayed true past `delay` ms, and then
 * keeps it true for at least `minDuration` ms — so a spinner never flashes for
 * a request that resolves quickly, and once shown it stays long enough to read.
 */
export function useSpinDelay(
  loading: boolean,
  options?: { delay?: number; minDuration?: number },
): boolean {
  const delay = options?.delay ?? 500;
  const minDuration = options?.minDuration ?? 200;

  const [spinning, setSpinning] = useState(false);
  // Timestamp the spinner became visible, so we can enforce minDuration.
  const spinStartRef = useRef<number | null>(null);

  useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    let minTimer: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      if (!spinning) {
        delayTimer = setTimeout(() => {
          spinStartRef.current = Date.now();
          setSpinning(true);
        }, delay);
      }
    } else if (spinning) {
      const shownFor = spinStartRef.current ? Date.now() - spinStartRef.current : 0;
      const remaining = minDuration - shownFor;
      if (remaining > 0) {
        minTimer = setTimeout(() => {
          spinStartRef.current = null;
          setSpinning(false);
        }, remaining);
      } else {
        spinStartRef.current = null;
        setSpinning(false);
      }
    }

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (minTimer) clearTimeout(minTimer);
    };
  }, [loading, spinning, delay, minDuration]);

  return spinning;
}
