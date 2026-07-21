/**
 * Component-test stub for `react-native-reanimated`.
 *
 * Only the pieces our components import at module scope. Easing functions
 * just need to be callable — no animation runs in these tests.
 */
type EasingFn = (t: number) => number;

const identity: EasingFn = (t) => t;

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

export default { Easing };
