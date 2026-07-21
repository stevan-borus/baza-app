/**
 * Component-test stub for `react-native-safe-area-context` — no notches in
 * a headless browser; insets are zero and SafeAreaView is a plain View.
 */
import React from "react";
import { View } from "react-native";

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

export function SafeAreaProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function SafeAreaView({
  children,
  ...rest
}: { children?: React.ReactNode } & Record<string, unknown>) {
  return <View {...rest}>{children}</View>;
}

export function useSafeAreaInsets() {
  return ZERO;
}

export function useSafeAreaFrame() {
  return { x: 0, y: 0, width: 1280, height: 720 };
}
