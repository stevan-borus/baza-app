import type { MotiProps, Transforms } from "moti";
import type { ViewStyle } from "react-native";

type Assert<T extends true> = T;
type IsResolved<T> = 0 extends 1 & T
  ? false
  : {} extends T
    ? false
    : [T] extends [never]
      ? false
      : true;

type ResolvedTransformValues = {
  [K in keyof Transforms]: IsResolved<Transforms[K]>;
};

export type TransformValuesAreResolved = Assert<
  ResolvedTransformValues extends Record<keyof Transforms, true> ? true : false
>;

export const validTransforms = {
  perspective: 800,
  rotate: "45deg",
  rotateX: "0.5rad",
  rotateY: "90deg",
  rotateZ: "1rad",
  scale: 1.2,
  scaleX: 0.8,
  scaleY: 2,
  translateX: "50%",
  translateY: -12,
  skewX: "10deg",
  skewY: "0.2rad",
} satisfies Transforms;

export const validMotiProps = {
  from: { rotate: "0deg", translateX: 0, scale: 1 },
  animate: { rotate: "45deg", translateX: "50%", scale: 1.2 },
  transition: { type: "timing", duration: 200, scale: { type: "spring" } },
} satisfies MotiProps<ViewStyle>;

// @ts-expect-error Rotation values must be strings or animated nodes.
export const invalidRotation = { rotate: 45 } satisfies Pick<Transforms, "rotate">;
// @ts-expect-error Scale values cannot have CSS units.
export const invalidScaleUnit = { scale: "2px" } satisfies Pick<Transforms, "scale">;
// @ts-expect-error Perspective values must be numeric or animated nodes.
export const invalidPerspectiveUnit = { perspective: "800px" } satisfies Pick<Transforms, "perspective">;
// @ts-expect-error Translations cannot be booleans.
export const invalidTranslation = { translateY: true } satisfies Pick<Transforms, "translateY">;

export const validNativeStyle = {
  transform: [{ rotate: "45deg" }, { translateX: "50%" }, { scale: 1.2 }],
} satisfies ViewStyle;

// @ts-expect-error The bridge must preserve React Native's numeric scale values.
export const invalidNativeScale = { transform: [{ scale: "2px" }] } satisfies ViewStyle;
// @ts-expect-error The bridge must preserve React Native's transform keys.
export const invalidNativeProperty = { transform: [{ stretch: 2 }] } satisfies ViewStyle;
