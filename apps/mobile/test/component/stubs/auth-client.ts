/**
 * Component-test stub for `@/lib/auth-client`.
 *
 * The real module wires better-auth + @better-auth/expo, whose internal
 * expo-constants/expo-linking imports the dep optimizer resolves natively
 * (package→package imports bypass our aliases). Component tests seed query
 * caches and never authenticate — auth flows live in e2e — so the client
 * shrinks to the four members app code touches.
 */
export const authClient = {
  getCookie: () => "",
  signIn: {
    email: async (_opts?: unknown) => ({ data: null, error: null }),
  },
  signOut: async () => ({ data: null, error: null }),
  useSession: () => ({ data: null, isPending: false, error: null }),
};
