/**
 * Transport contract for `apiFetch`.
 *
 * Native has no browser cookie jar: the session cookie lives in SecureStore
 * and `apiFetch` copies it onto each request as a `Cookie` header. Since
 * BetterAuth 1.7 `authClient.getCookie()` reads storage asynchronously, so the
 * request must wait for the stored value before it leaves. Web keeps the
 * browser-managed cookie and never touches native storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  platform: { OS: "ios" as string },
  getCookie: (() => "") as () => unknown,
}));

// react-native's entry is Flow source; the node-env unit project can't parse it.
vi.mock("react-native", () => ({ Platform: fakes.platform }));

// The real auth client pulls in expo-secure-store; fake the storage-backed
// cookie read at that boundary.
vi.mock("@/lib/auth-client", () => ({
  authClient: { getCookie: () => fakes.getCookie() },
}));

const { apiFetch } = await import("@/lib/api");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response("{}", { status: 200 }),
);

function sentInit(): RequestInit {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("fetch was never called");
  return call[1] ?? {};
}

function sentHeaders(): Headers {
  return new Headers(sentInit().headers);
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  fakes.platform.OS = "ios";
  fakes.getCookie = () => "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch on native", () => {
  it("waits for the stored session cookie, then sends it with the caller's headers", async () => {
    const cookie = deferred<string>();
    fakes.getCookie = () => cookie.promise;

    const pending = apiFetch("https://api.test/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Trace": "abc" },
      body: "{}",
    });

    expect(fetchMock).not.toHaveBeenCalled();

    cookie.resolve("better-auth.session_token=tok123");
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.test/api/me");
    const headers = sentHeaders();
    expect(headers.get("Cookie")).toBe("better-auth.session_token=tok123");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Trace")).toBe("abc");
    expect(sentInit().method).toBe("POST");
    expect(sentInit().body).toBe("{}");
    expect(sentInit().credentials).toBe("omit");
  });

  it("sends no Cookie header when nothing is stored", async () => {
    fakes.getCookie = async () => "";

    await apiFetch("https://api.test/api/me", {
      headers: { Accept: "application/json" },
    });

    const headers = sentHeaders();
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.get("Accept")).toBe("application/json");
    expect(sentInit().credentials).toBe("omit");
  });

  it("does not send the request when the stored cookie can't be read", async () => {
    const storageError = new Error("SecureStore unavailable");
    fakes.getCookie = () => Promise.reject(storageError);

    await expect(apiFetch("https://api.test/api/me")).rejects.toBe(
      storageError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("apiFetch on web", () => {
  it("leaves cookies to the browser and never reads native storage", async () => {
    fakes.platform.OS = "web";
    const getCookie = vi.fn(() => "should-not-be-read");
    fakes.getCookie = getCookie;

    await apiFetch("https://api.test/api/me", {
      headers: { Accept: "application/json" },
    });

    expect(getCookie).not.toHaveBeenCalled();
    expect(sentInit().credentials).toBe("include");
    const headers = sentHeaders();
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.get("Accept")).toBe("application/json");
  });
});
