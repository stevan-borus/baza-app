/**
 * Component-project setup. RTL's automatic cleanup only registers itself
 * when test globals exist; we run without globals, so unmount explicitly or
 * every render accumulates in document.body and queries cross-match.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// Metro resolves `require("@/assets/….webp")` to an asset id at build time;
// the browser module runner has no `require`. Return the path — RNW Image
// accepts a string source, and no component test asserts on pixels.
declare global {
  // eslint-disable-next-line no-var
  var require: ((id: string) => unknown) | undefined;
}
globalThis.require = (id: string) => id;

// RN runtime global that expo's error-handling init reads at import time.
let globalErrorHandler: ((error: unknown, isFatal?: boolean) => void) | null =
  null;
(globalThis as Record<string, unknown>).ErrorUtils = {
  getGlobalHandler: () => globalErrorHandler,
  setGlobalHandler: (handler: typeof globalErrorHandler) => {
    globalErrorHandler = handler;
  },
};
