import React, { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInLeft } from "react-native-reanimated";

/**
 * Typography primitives.
 *
 * Pairing:
 *   - Display family (Fraunces) — `font-display` / `font-display-bold`
 *     utilities. Used for screen titles, big numbers, brand chrome.
 *     Refined variable serif.
 *   - Body family (DM Sans) — `font-sans` (default) / `font-body-medium` /
 *     `font-body-semibold` / `font-body-bold` utilities. Geometric modern sans.
 *
 * Avoid `font-body-bold` (Tailwind weight) — RN doesn't synthesize weights from a
 * single font, so each weight is its own utility mapped to a loaded face.
 */

type LinkTextProps = React.ComponentProps<typeof Text> & {
  children: React.ReactNode;
};

export function LinkText({
  children,
  className,
  style,
  color,
  fontSize,
  onPress,
  ...props
}: LinkTextProps & { color?: string; fontSize?: string | number }) {
  const resolvedFontSize: number | undefined =
    typeof fontSize === "number"
      ? fontSize
      : typeof fontSize === "string" && fontSize.startsWith("$")
        ? 14
        : typeof fontSize === "string"
          ? Number.parseFloat(fontSize) || undefined
          : undefined;
  const text = (
    <Text
      className={`font-body-medium py-2 text-accent ${className ?? ""}`}
      style={[
        resolvedFontSize !== undefined ? { fontSize: resolvedFontSize } : null,
        color ? { color } : null,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );

  // When given an onPress, wrap in a Pressable that uses opacity feedback
  // only — never a background highlight (which paints a rectangle around
  // the text on press). For Text-only LinkText (no onPress), don't add the
  // wrapper so it inlines naturally inside parent layouts.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        android_ripple={null}
        className="active:opacity-60"
      >
        {text}
      </Pressable>
    );
  }
  return text;
}

type LabelProps = React.ComponentProps<typeof Text> & {
  children: React.ReactNode;
};

export function Label({ children, className, style, ...props }: LabelProps) {
  return (
    <Text
      className={`text-base font-body-semibold text-foreground ${className ?? ""}`}
      style={style}
      {...props}
    >
      {children}
    </Text>
  );
}

export function ScreenTitle({
  children,
  className,
  style,
  ...props
}: PropsWithChildren & React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={`text-[28px] font-display-bold tracking-tight text-foreground ${className ?? ""}`}
      style={[{ letterSpacing: -0.5 }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}

export function SectionHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Animated.View entering={FadeInLeft.duration(400).springify()}>
      <View className={`gap-1 ${className ?? ""}`}>
        <Text className="text-base font-body-semibold text-foreground">{title}</Text>
        {subtitle ? (
          <Text className="text-sm text-muted">{subtitle}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function SectionLabel({
  children,
  className,
  style,
  ...props
}: PropsWithChildren & React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={`text-xs font-body-semibold uppercase tracking-wider text-muted ${className ?? ""}`}
      style={[{ letterSpacing: 0.5 }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}
