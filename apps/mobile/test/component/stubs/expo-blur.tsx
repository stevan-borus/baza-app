/**
 * Component-test stub for `expo-blur` — the blur is purely visual chrome.
 */
import React from "react";
import { View } from "react-native";

export function BlurView({
  children,
  ...rest
}: { children?: React.ReactNode } & Record<string, unknown>) {
  return <View {...rest}>{children}</View>;
}
