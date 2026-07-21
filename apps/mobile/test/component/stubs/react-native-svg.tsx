/**
 * Component-test stub for `react-native-svg`.
 *
 * Its web build still reaches fabric native components through the dep
 * optimizer's resolver, so it can't load here. Icons are decorative in
 * behavior tests: lucide-react-native's own code runs for real against
 * these inert primitives.
 */
import React from "react";
import { View } from "react-native";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function Svg({ children, ...rest }: AnyProps) {
  return <View {...rest}>{children}</View>;
}

const Inert = (_props: AnyProps) => null;

export default Svg;
export { Svg };
export const Path = Inert;
export const Circle = Inert;
export const Ellipse = Inert;
export const Rect = Inert;
export const Line = Inert;
export const Polyline = Inert;
export const Polygon = Inert;
export const G = Inert;
export const Defs = Inert;
export const LinearGradient = Inert;
export const RadialGradient = Inert;
export const Stop = Inert;
export const ClipPath = Inert;
export const Text = Inert;
