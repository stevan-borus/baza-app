import React, { PropsWithChildren } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_HEIGHT } from "./constants";

const webConstraint =
  Platform.OS === "web"
    ? { maxWidth: 480, marginLeft: "auto" as const, marginRight: "auto" as const, width: "100%" as const }
    : {};

type Props = PropsWithChildren & ViewProps;

/** Wraps screen content with proper insets for transparent header + absolute tab bar. */
export function ScreenContainer({ children, className, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View
        className={`flex-1 px-6 gap-6 ${className ?? ""}`}
        style={{ paddingTop: topPadding, paddingBottom: TAB_BAR_HEIGHT + 16, ...webConstraint }}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

/** Wraps full-height screen content (no ScrollView) with proper insets. */
export function ScreenContainerRaw({ children, className, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View
        className={`flex-1 ${className ?? ""}`}
        style={{ paddingTop: topPadding, paddingBottom: TAB_BAR_HEIGHT, ...webConstraint }}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
