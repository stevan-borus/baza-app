/**
 * Component-test stub for `react-native-keyboard-controller`.
 *
 * The library's scroll views are built on reanimated worklets and a native
 * module — neither exists outside Metro, and its deep imports pull in
 * reanimated APIs (useAnimatedRef, scrollTo, useEvent) that only the native
 * runtime provides. There is no keyboard in headless Chromium, so the
 * keyboard-aware behaviour is nothing a component test can assert: the scroll
 * views degrade to a plain ScrollView and the rest are inert.
 */
import React from "react";
import { ScrollView, View, type ScrollViewProps, type ViewProps } from "react-native";

/** Drops the keyboard-only props RN-Web's ScrollView doesn't understand. */
export const KeyboardAwareScrollView = React.forwardRef<
  ScrollView,
  ScrollViewProps & { bottomOffset?: number; mode?: string }
>(function KeyboardAwareScrollView({ bottomOffset, mode, ...props }, ref) {
  return <ScrollView ref={ref} {...props} />;
});

export const KeyboardAvoidingView = React.forwardRef<View, ViewProps>(
  function KeyboardAvoidingView(props, ref) {
    return <View ref={ref} {...props} />;
  },
);

export const KeyboardProvider = ({ children }: { children?: React.ReactNode }) => (
  <>{children}</>
);

export const KeyboardToolbar = () => null;
export const KeyboardStickyView = ({ children }: { children?: React.ReactNode }) => (
  <>{children}</>
);

export const KeyboardController = {
  setInputMode: () => {},
  setDefaultMode: () => {},
  dismiss: async () => {},
};

export const KeyboardEvents = {
  addListener: () => ({ remove: () => {} }),
};

export function useKeyboardHandler() {}
export function useReanimatedKeyboardAnimation() {
  return { height: { value: 0 }, progress: { value: 0 } };
}
export function useKeyboardState() {
  return { isVisible: false, height: 0 };
}
