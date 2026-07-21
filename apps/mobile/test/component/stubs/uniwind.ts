/**
 * Component-test stub for `uniwind`.
 *
 * Uniwind's className→style rewriting only exists inside Metro's resolver, so
 * in Vitest browser mode `className` is inert either way. `withUniwind`
 * becomes identity; theme switching becomes a no-op.
 */
export const withUniwind = <T,>(component: T): T => component;

export const Uniwind = {
  setTheme(_theme: string) {},
};
