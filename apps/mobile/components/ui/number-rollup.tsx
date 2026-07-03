import React, { useEffect, useRef, useState } from "react";
import { Text, type TextProps } from "react-native";

type Props = Omit<TextProps, "children"> & {
  value: number;
  durationMs?: number;
  formatter?: (n: number) => string;
};

/**
 * Animated numeric counter.
 *
 * On mount the component renders `value` statically — no animation. The
 * previous behaviour animated from 0 → value on first mount, which read
 * as a placeholder peak when parents mounted the rollup with the final
 * loaded number directly (e.g. when a query resolved before the rollup
 * mounted). Subsequent prop changes still animate.
 *
 * Implementation note: the static initial seed is done via `useState`'s
 * initializer so server-render and the first client paint show the real
 * value. `fromRef` is then primed to the same value so the next animation
 * starts from there instead of 0.
 */
export function NumberRollup({
  value,
  durationMs = 600,
  formatter = (n) => String(Math.round(n)),
  className,
  ...rest
}: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    // Elapsed-time measurement for the rAF animation — under a pinned anchor
    // nowMs() is constant, so progress would stay 0 and the rollup would
    // never complete. Wall clock is the correct source here.
    // now-exempt: elapsed-time measurement, not "what time is it"
    const start = Date.now();
    const from = fromRef.current;
    const to = value;
    let raf = 0;
    const step = () => {
      // now-exempt: same elapsed-time measurement as `start` above.
      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <Text className={className} {...rest}>
      {formatter(display)}
    </Text>
  );
}
