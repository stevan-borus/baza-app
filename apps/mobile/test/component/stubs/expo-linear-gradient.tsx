/**
 * expo-linear-gradient renders through expo-modules-core's native view
 * registry, which isn't available outside Metro — and the package pulls its
 * own React copy into the browser bundle, which breaks hooks for everything
 * mounted alongside it.
 *
 * The gradient is a decorative scrim in every one of our call sites; no
 * component test asserts on its pixels, only on the layout of the content
 * sitting over it. So it renders as a plain absolutely-positionable View that
 * honors the style prop, keeping the geometry tests meaningful.
 */
import React from "react";
import { View, type ViewProps } from "react-native";

export type LinearGradientProps = ViewProps & {
  colors?: readonly string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: readonly number[];
};

export function LinearGradient({
  colors: _colors,
  start: _start,
  end: _end,
  locations: _locations,
  ...rest
}: LinearGradientProps) {
  return <View {...rest} />;
}

export default { LinearGradient };
