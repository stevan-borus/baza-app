import React, { useEffect, useRef, useState } from "react";
import { Text, type TextProps } from "react-native";

type Props = Omit<TextProps, "children"> & {
  value: number;
  durationMs?: number;
  formatter?: (n: number) => string;
};

export function NumberRollup({
  value,
  durationMs = 600,
  formatter = (n) => String(Math.round(n)),
  className,
  ...rest
}: Props) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const start = Date.now();
    const from = fromRef.current;
    const to = value;
    let raf = 0;
    const step = () => {
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
