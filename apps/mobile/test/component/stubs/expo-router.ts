/**
 * Component-test stub for `expo-router`.
 *
 * Navigation is a screen-level side effect — component tests assert WHERE a
 * press navigates, not the transition itself. Calls are recorded in
 * `routerCalls`; tests truncate it in beforeEach and assert on entries.
 */
import { useEffect } from "react";

export type Href = string | { pathname: string; params?: Record<string, unknown> };

export const routerCalls: { method: string; args: unknown[] }[] = [];

function record(method: string) {
  return (...args: unknown[]) => {
    routerCalls.push({ method, args });
  };
}

export const router = {
  push: record("push"),
  replace: record("replace"),
  navigate: record("navigate"),
  back: record("back"),
  dismiss: record("dismiss"),
  setParams: record("setParams"),
  canGoBack: () => true,
};

export function useRouter() {
  return router;
}

export function useLocalSearchParams(): Record<string, string> {
  return {};
}

export function usePathname(): string {
  return "/";
}

/** Runs the callback on mount like a focused screen; supports cleanup. */
export function useFocusEffect(callback: () => void | (() => void)) {
  useEffect(() => callback(), [callback]);
}

export function Link() {
  return null;
}

export function Redirect() {
  return null;
}
