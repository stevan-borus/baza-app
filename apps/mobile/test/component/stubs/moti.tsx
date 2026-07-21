/**
 * Component-test stub for `moti`.
 *
 * Moti drives entrance animations through reanimated, which can't load
 * outside Metro. Animations are decorative for behavior tests — render the
 * underlying primitives and drop the animation props.
 */
import React from "react";
import { Text, View } from "react-native";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function strip(props: AnyProps) {
  const { from: _f, animate: _a, exit: _e, transition: _t, ...rest } = props;
  return rest;
}

export function MotiView(props: AnyProps) {
  return <View {...strip(props)} />;
}

export function MotiText(props: AnyProps) {
  return <Text {...strip(props)} />;
}
