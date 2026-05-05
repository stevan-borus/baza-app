import React, { PropsWithChildren } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, BackButton } from "./app-header";
import { UserAvatar } from "./user-avatar";

const webConstraint =
  Platform.OS === "web"
    ? { maxWidth: 480, marginLeft: "auto" as const, marginRight: "auto" as const, width: "100%" as const }
    : {};

/** Bar height (icons + label, excluding bottom safe area). */
const TAB_BAR_INNER_HEIGHT = 56;

type HeaderProps = {
  title?: string;
  rightSlot?: React.ReactNode;
  /**
   *   - `tab` (default): UserAvatar in left slot → opens ProfileSheet.
   *   - `detail`: BackButton in left slot.
   *   - `none`: no header at all.
   */
  headerVariant?: "tab" | "detail" | "none";
};

type Props = PropsWithChildren & ViewProps & HeaderProps;

function HeaderForVariant({ title, rightSlot, headerVariant = "tab" }: HeaderProps) {
  if (headerVariant === "none" || !title) return null;
  const leftSlot = headerVariant === "detail" ? <BackButton /> : <UserAvatar />;
  return <AppHeader title={title} leftSlot={leftSlot} rightSlot={rightSlot} />;
}

/** Hook computing the bottom padding needed to clear the floating tab bar. */
export function useTabBarBottomPadding(extra = 16) {
  const insets = useSafeAreaInsets();
  return TAB_BAR_INNER_HEIGHT + insets.bottom + extra;
}

/**
 * Body wrapper for tab screens.
 *
 *   <ScreenContainer title={t("tabs.schedule")} rightSlot={<HeaderIconButton ... />}>
 *     ...page content
 *   </ScreenContainer>
 *
 * Renders the forest-green AppHeader at the top, then the body with default
 * horizontal/top padding and tab-bar-aware bottom padding.
 */
export function ScreenContainer({
  children,
  className,
  style,
  title,
  rightSlot,
  headerVariant,
  ...rest
}: Props) {
  const bottomPad = useTabBarBottomPadding();
  return (
    <View className="flex-1 bg-background">
      <HeaderForVariant title={title} rightSlot={rightSlot} headerVariant={headerVariant} />
      <View
        className={`flex-1 px-6 pt-6 gap-6 ${className ?? ""}`}
        style={[{ paddingBottom: bottomPad, ...webConstraint }, style]}
        {...rest}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * No-padding variant for screens that compose their own ScrollView. Adds a
 * top spacer between the AppHeader and content, but bottom padding must be
 * applied by the caller (typically on the ScrollView's `contentContainerStyle`)
 * via `useTabBarBottomPadding()`.
 */
export function ScreenContainerRaw({
  children,
  className,
  style,
  title,
  rightSlot,
  headerVariant,
  ...rest
}: Props) {
  return (
    <View className="flex-1 bg-background">
      <HeaderForVariant title={title} rightSlot={rightSlot} headerVariant={headerVariant} />
      <View
        className={`flex-1 ${className ?? ""}`}
        style={[{ ...webConstraint }, style]}
        {...rest}
      >
        {children}
      </View>
    </View>
  );
}
