/**
 * Component-test stub for `react-native-reanimated`.
 *
 * Only the pieces our components import at module scope. Easing functions
 * just need to be callable — no animation runs in these tests.
 */
import { Text, View, ScrollView, Image, FlatList } from "react-native";

type EasingFn = (t: number) => number;

const identity: EasingFn = (t) => t;

/** Animated.View etc. render as their plain counterparts; entering/exiting
 * and animated-style props pass through harmlessly. */
export const Animated = {
  View,
  Text,
  ScrollView,
  Image,
  FlatList,
  createAnimatedComponent: <T,>(component: T): T => component,
};

export const Easing = {
  linear: identity,
  ease: identity,
  cubic: identity,
  quad: identity,
  in: (_f: EasingFn): EasingFn => identity,
  out: (_f: EasingFn): EasingFn => identity,
  inOut: (_f: EasingFn): EasingFn => identity,
  bezier: () => ({ factory: () => identity }),
};

/** Entering/exiting presets — chainable no-ops (.duration().delay()…). */
function animationPreset(): Record<string, unknown> {
  const preset: Record<string, unknown> = {};
  for (const key of ["duration", "delay", "springify", "damping", "easing", "build"]) {
    preset[key] = () => preset;
  }
  return preset;
}

export const FadeIn = animationPreset();
export const FadeOut = animationPreset();
export const FadeInDown = animationPreset();
export const FadeInUp = animationPreset();
export const FadeOutDown = animationPreset();
export const FadeOutUp = animationPreset();
export const SlideInDown = animationPreset();
export const SlideInUp = animationPreset();
export const SlideOutDown = animationPreset();
export const SlideOutUp = animationPreset();
export const Layout = animationPreset();
export const LinearTransition = animationPreset();

export function useSharedValue<T>(initial: T) {
  return { value: initial };
}
export function useAnimatedStyle(factory: () => Record<string, unknown>) {
  return factory();
}
export const withTiming = <T,>(v: T) => v;
export const withSpring = <T,>(v: T) => v;
export const withDelay = <T,>(_ms: number, v: T) => v;
export const withSequence = <T,>(...values: T[]) => values[values.length - 1];
export const withRepeat = <T,>(v: T) => v;
export const cancelAnimation = () => {};
export const runOnJS = <T extends (...args: never[]) => unknown>(fn: T) => fn;
export function useAnimatedReaction() {}
export function useDerivedValue<T>(factory: () => T) {
  return { value: factory() };
}
export function interpolate(value: number, _input: number[], output: number[]) {
  return output[0] ?? value;
}
export const interpolateColor = (_v: number, _i: number[], colors: string[]) =>
  colors[0];

export default Animated;
