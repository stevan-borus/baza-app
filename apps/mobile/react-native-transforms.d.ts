// Restore Moti 0.30's transform aliases from React Native 0.88's public style type.
import type { TransformsStyle } from "react-native";

type TransformEntry = NonNullable<
  Exclude<NonNullable<TransformsStyle["transform"]>, string>[number]
>;

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
