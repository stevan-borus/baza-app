/**
 * Component-test stub for `expo-modules-core` — the native module registry.
 * Several expo-* packages import it package-to-package where our per-package
 * stubs can't intervene; this cuts the whole native graph off at its root.
 */
export class EventEmitter {
  addListener(_event: string, _listener: (...args: unknown[]) => void) {
    return { remove() {} };
  }
  removeAllListeners(_event?: string) {}
  emit(_event: string, ..._args: unknown[]) {}
}

export class NativeModule extends EventEmitter {}
export class SharedObject extends EventEmitter {}
export class SharedRef extends SharedObject {}

/**
 * Native modules resolve to a permissive no-op proxy: any property read
 * yields a function returning undefined. Module-scope initialization in
 * expo-* packages then succeeds; behavior that MATTERS to a test must be
 * asserted through the UI, where a silent no-op will fail the assertion.
 */
export function requireNativeModule(_name: string): unknown {
  return new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === Symbol.toPrimitive ? () => "" : () => undefined,
    },
  );
}

export function requireOptionalNativeModule(_name: string): null {
  return null;
}

export function requireNativeViewManager(_name: string) {
  return () => null;
}

export const NativeModulesProxy = {};
export const Platform = { OS: "web" };

export function uuidv4(): string {
  return "00000000-0000-4000-8000-000000000000";
}

export class CodedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class UnavailabilityError extends CodedError {
  constructor(moduleName: string, propertyName: string) {
    super(
      "ERR_UNAVAILABLE",
      `The method or property ${moduleName}.${propertyName} is not available in component tests`,
    );
  }
}

export function registerWebModule<T>(module: T, _name?: string): T {
  return module;
}

export const PermissionStatus = {
  GRANTED: "granted",
  UNDETERMINED: "undetermined",
  DENIED: "denied",
} as const;

type PermissionResponse = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  expires: string;
};

const granted: PermissionResponse = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
};

export function createPermissionHook() {
  return () =>
    [granted, async () => granted, async () => granted] as const;
}

export async function reloadAppAsync(_reason?: string) {}

export function installOnUIRuntime() {}
