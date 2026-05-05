/**
 * Studio typography primitives.
 *
 * Use Tailwind utility classes where a token exists. Inline `style` only
 * carries values without a utility (specific font sizes/letter spacing/
 * line heights that aren't part of the type scale).
 */
import React from "react";
import { Text } from "react-native";

export function CapsLabel({
  children,
  size = 11,
  tracking = 2,
  className,
}: {
  children: React.ReactNode;
  size?: number;
  tracking?: number;
  className?: string;
}) {
  return (
    <Text
      className={`font-body-semibold uppercase text-foreground ${className ?? ""}`}
      style={{ fontSize: size, letterSpacing: tracking }}
    >
      {children}
    </Text>
  );
}

export function BodyTitle({
  children,
  size = 16,
  className,
  numberOfLines,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
  numberOfLines?: number;
}) {
  return (
    <Text
      className={`font-body-semibold text-foreground ${className ?? ""}`}
      numberOfLines={numberOfLines}
      style={{ fontSize: size, letterSpacing: -0.2 }}
    >
      {children}
    </Text>
  );
}

export function Display({
  children,
  size = 28,
  className,
  numberOfLines,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
  numberOfLines?: number;
}) {
  return (
    <Text
      className={`font-body-bold text-foreground ${className ?? ""}`}
      numberOfLines={numberOfLines}
      style={{ fontSize: size, letterSpacing: -0.6, lineHeight: size * 1.12 }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  size = 14,
  className,
  numberOfLines,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
  numberOfLines?: number;
}) {
  return (
    <Text
      className={`font-sans text-muted ${className ?? ""}`}
      numberOfLines={numberOfLines}
      style={{ fontSize: size, lineHeight: size * 1.4 }}
    >
      {children}
    </Text>
  );
}
