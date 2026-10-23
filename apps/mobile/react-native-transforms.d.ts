// Moti 0.30 builds its animatable transform keys (`translateY`, `scale`, …)
// from per-transform types that React Native's strict TypeScript API, the
// default since 0.88, no longer exports. Missing, they resolve to `any`, which
// widens every Moti `transition` prop to an index signature that rejects
// `type: "timing"`. Declare them again, derived from RN's own `transform` entry.
import type { TransformsStyle } from "react-native";

type TransformEntry = Exclude<
  NonNullable<TransformsStyle["transform"]>,
  string
>[number];

type SingleTransform<K extends keyof TransformEntry> = {
  [P in K]: NonNullable<TransformEntry[P]>;
};

declare module "react-native" {
  export type PerspectiveTransform = SingleTransform<"perspective">;
  export type RotateTransform = SingleTransform<"rotate">;
  export type RotateXTransform = SingleTransform<"rotateX">;
  export type RotateYTransform = SingleTransform<"rotateY">;
  export type RotateZTransform = SingleTransform<"rotateZ">;
  export type ScaleTransform = SingleTransform<"scale">;
  export type ScaleXTransform = SingleTransform<"scaleX">;
  export type ScaleYTransform = SingleTransform<"scaleY">;
  export type TranslateXTransform = SingleTransform<"translateX">;
  export type TranslateYTransform = SingleTransform<"translateY">;
  export type SkewXTransform = SingleTransform<"skewX">;
  export type SkewYTransform = SingleTransform<"skewY">;
}
