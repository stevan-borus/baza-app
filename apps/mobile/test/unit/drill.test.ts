/**
 * Cross-tab drill contract — ADR-0005.
 *
 * One module owns BOTH sides of a drill: the origin builds the push href
 * (destination path + filter params + encoded returnTo) and the destination
 * parses those same params back. These tests pin the param contract so an
 * origin and its destination can't drift apart again — the original bug was
 * Prihod sending `from`/`to` that Naplata never read, so the drill landed
 * unfiltered with nothing failing.
 */
import { describe, expect, it, vi } from "vitest";

// drill.ts exports hooks alongside the pure contract; mock the host deps so
// the module is importable under the node test environment. The hooks hold
// no React state of their own (React Compiler handles memoization), so with
// these deps mocked they are callable as plain functions.
const useLocalSearchParamsMock = vi.fn<() => Record<string, unknown>>(
  () => ({}),
);
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => useLocalSearchParamsMock(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `t(${key})` }),
}));

import {
  drillHref,
  parseDrillWindow,
  parseReturnTo,
  useDrillWindow,
  useReturnToPill,
} from "@/lib/admin/drill";

describe("drillHref (origin side)", () => {
  it("builds the Naplata drill with a from/to window and an encoded returnTo", () => {
    const href = drillHref({
      to: "naplata",
      returnTo: "/(admin)/izvestaji/prihod",
      window: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(href).toEqual({
      pathname: "/(admin)/naplata",
      params: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-06-01T00:00:00.000Z",
        returnTo: encodeURIComponent("/(admin)/izvestaji/prihod"),
      },
    });
  });

  it("builds the Naplata drill without a window — returnTo only (Prihod's 'recent payments' drill)", () => {
    const href = drillHref({
      to: "naplata",
      returnTo: "/(admin)/izvestaji/prihod",
    });
    expect(href).toEqual({
      pathname: "/(admin)/naplata",
      params: { returnTo: encodeURIComponent("/(admin)/izvestaji/prihod") },
    });
  });

  it("builds the client-detail drill (Paketi activation row → Klijenti tab)", () => {
    const href = drillHref({
      to: "klijent",
      returnTo: "/(admin)/izvestaji/paketi",
      clientUserId: "user-123",
    });
    expect(href).toEqual({
      pathname: "/(admin)/klijenti/[id]",
      params: {
        id: "user-123",
        returnTo: encodeURIComponent("/(admin)/izvestaji/paketi"),
      },
    });
  });

  it("builds the session-detail drill (Rezervacije row → Pregled tab)", () => {
    const href = drillHref({
      to: "session",
      returnTo: "/(admin)/izvestaji/rezervacije",
      sessionId: "sess-9",
    });
    expect(href).toEqual({
      pathname: "/(admin)/pregled/sessions/[id]",
      params: {
        id: "sess-9",
        returnTo: encodeURIComponent("/(admin)/izvestaji/rezervacije"),
      },
    });
  });
});

describe("parseReturnTo (destination side)", () => {
  it("round-trips the returnTo built by drillHref back to the origin path + pill label key", () => {
    const href = drillHref({
      to: "naplata",
      returnTo: "/(admin)/izvestaji/prihod",
    });
    expect(parseReturnTo(href.params.returnTo)).toEqual({
      path: "/(admin)/izvestaji/prihod",
      labelKey: "admin.izvestaji.labels.izvestaji",
    });
  });

  it("maps a naplata-prefixed path to the Naplata label key", () => {
    expect(
      parseReturnTo(encodeURIComponent("/(admin)/naplata?x=1")),
    ).toEqual({
      path: "/(admin)/naplata?x=1",
      labelKey: "admin.izvestaji.labels.naplata",
    });
  });

  it("rejects missing, empty, non-string, malformed, and unknown-prefix values", () => {
    expect(parseReturnTo(undefined)).toBeNull();
    expect(parseReturnTo("")).toBeNull();
    expect(parseReturnTo(["a", "b"])).toBeNull();
    // Truncated percent-encoding throws in decodeURIComponent.
    expect(parseReturnTo("%E0%A4%A")).toBeNull();
    // Decodes fine but isn't a known origin tab — no pill.
    expect(parseReturnTo(encodeURIComponent("/(admin)/klijenti"))).toBeNull();
  });
});

describe("parseDrillWindow (destination side)", () => {
  it("round-trips the window built by drillHref", () => {
    const href = drillHref({
      to: "naplata",
      returnTo: "/(admin)/izvestaji/prihod",
      window: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(parseDrillWindow(href.params)).toEqual({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });
  });

  it("returns null when params are absent — the destination falls back to its own selected window", () => {
    expect(parseDrillWindow({})).toBeNull();
    expect(parseDrillWindow({ returnTo: "x" })).toBeNull();
  });

  it("returns null when either endpoint is missing — a half-window must not half-filter", () => {
    expect(
      parseDrillWindow({ from: "2026-05-01T00:00:00.000Z" }),
    ).toBeNull();
    expect(parseDrillWindow({ to: "2026-06-01T00:00:00.000Z" })).toBeNull();
  });

  it("rejects non-date garbage, repeated params, and inverted windows", () => {
    expect(parseDrillWindow({ from: "not-a-date", to: "also-not" })).toBeNull();
    expect(
      parseDrillWindow({
        from: ["2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z"],
        to: "2026-06-01T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      parseDrillWindow({
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-05-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("passes the origin's ISO strings through untouched (no re-formatting)", () => {
    const out = parseDrillWindow({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-08T12:30:00.000Z",
    });
    expect(out?.from).toBe("2026-05-01T00:00:00.000Z");
    expect(out?.to).toBe("2026-05-08T12:30:00.000Z");
  });
});

describe("destination hooks delegate to the pure parsers", () => {
  it("useReturnToPill returns the decoded path + translated label off the route params", () => {
    useLocalSearchParamsMock.mockReturnValue({
      returnTo: encodeURIComponent("/(admin)/izvestaji/prihod"),
    });
    expect(useReturnToPill()).toEqual({
      path: "/(admin)/izvestaji/prihod",
      label: "t(admin.izvestaji.labels.izvestaji)",
    });

    useLocalSearchParamsMock.mockReturnValue({});
    expect(useReturnToPill()).toBeNull();
  });

  it("useDrillWindow returns the parsed window off the route params, null otherwise", () => {
    useLocalSearchParamsMock.mockReturnValue({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });
    expect(useDrillWindow()).toEqual({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });

    useLocalSearchParamsMock.mockReturnValue({});
    expect(useDrillWindow()).toBeNull();
  });
});
