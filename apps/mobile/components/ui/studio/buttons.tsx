/**
 * Studio buttons. Black-on-bone primary CTA, ink-outlined secondary,
 * underlined ghost. Uses utility classes for theme-tokened colors;
 * inline `style` only for the runtime-pressed state and any non-token fill.
 */
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useThemeTokens } from "@/components/ui/tokens";
import { STUDIO } from "./palette";

type CommonProps = {
  label: string;
  onPress: () => void;
  block?: boolean;
  disabled?: boolean;
  /** Shows a spinner on the left of the label and blocks press while true. */
  loading?: boolean;
  icon?: React.ReactNode;
};

/**
 * Default = `bg-foreground` block with `text-background` label, theme-aware:
 *   - light: ink block, bone label
 *   - dark:  cream block, dark label
 *
 * Pass `fill` + `textColor` to override (e.g. white CTA on a dark photo
 * overlay). `disabled` swaps to a quieter chrome that stays legible
 * (instead of just dimming opacity, which makes dark-on-light text muddy).
 */
export function StudioButton({
  label,
  onPress,
  block = false,
  disabled = false,
  loading = false,
  fill,
  textColor,
  icon,
}: CommonProps & { fill?: string; textColor?: string }) {
  const hasCustomFill = !!fill;
  const inert = disabled || loading;
  const tokens = useThemeTokens();

  // Pressable className is composed conditionally so we can swap the whole
  // visual when disabled. Disabled = thin border, no fill — so it doesn't
  // paint a contrasting block over the page bg.
  const pressableCls = [
    "px-5 py-3.5 rounded items-center justify-center flex-row gap-2",
    block ? "self-stretch" : "self-start",
    disabled
      ? "border border-glass-border"
      : hasCustomFill
        ? ""
        : "bg-foreground active:opacity-90",
  ].join(" ");

  // Same for the label — disabled gets a faint color (still readable).
  const textCls = [
    "font-body-semibold uppercase",
    disabled ? "text-faint" : textColor ? "" : "text-background",
  ].join(" ");

  // Spinner color tracks the text color so it always reads against the fill.
  const spinnerColor = disabled
    ? tokens.faint
    : textColor ?? (hasCustomFill ? STUDIO.ink : tokens.background);

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      className={pressableCls}
      style={
        !disabled && hasCustomFill ? { backgroundColor: fill } : undefined
      }
    >
      {/* Adornment slot — fixed 14pt box so the spinner never grows the
          button. Sits to the left of the label when loading or when an
          icon was passed. The slot collapses (no width) otherwise. */}
      {loading ? (
        <View
          style={{
            width: 14,
            height: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator
            size="small"
            color={spinnerColor}
            style={{ transform: [{ scale: 0.7 }] }}
          />
        </View>
      ) : (
        icon
      )}
      <Text
        className={textCls}
        style={{
          fontSize: 12,
          letterSpacing: 1.4,
          ...(!disabled && textColor ? { color: textColor } : null),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StudioOutlineButton({
  label,
  onPress,
  block = false,
  icon,
}: CommonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-5 py-3.5 rounded border border-foreground items-center justify-center flex-row gap-2 active:opacity-80 ${
        block ? "self-stretch" : "self-start"
      }`}
    >
      {icon}
      <Text
        className="font-body-semibold uppercase text-foreground"
        style={{ fontSize: 12, letterSpacing: 1.4 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StudioGhostButton({
  label,
  onPress,
  underline = true,
}: {
  label: string;
  onPress: () => void;
  underline?: boolean;
}) {
  return (
    // android_ripple={null} disables the default platform ripple square so
    // text-only links don't render a rectangular highlight on press.
    <Pressable
      onPress={onPress}
      hitSlop={8}
      android_ripple={null}
      className="active:opacity-60"
    >
      <Text
        className={`font-body-medium text-muted ${underline ? "underline" : ""}`}
        style={{ fontSize: 12 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Re-export for callers that need the raw value (e.g. native icon `color`).
export const STUDIO_PALETTE = STUDIO;
