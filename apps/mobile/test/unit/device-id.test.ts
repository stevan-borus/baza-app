import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory AsyncStorage stand-in — the contract under test is "generate once,
// persist, return the same value forever after".
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  },
}));

import { getStableDeviceId } from "@/lib/device-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("getStableDeviceId", () => {
  beforeEach(() => {
    store.clear();
  });

  it("generates a v4-shaped UUID on first call", async () => {
    const id = await getStableDeviceId();
    expect(id).toMatch(UUID_RE);
  });

  it("returns the same id on every subsequent call (persisted)", async () => {
    const first = await getStableDeviceId();
    const second = await getStableDeviceId();
    const third = await getStableDeviceId();
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("persists the generated id so a fresh read returns it", async () => {
    const generated = await getStableDeviceId();
    expect(store.get("@baza/device-id")).toBe(generated);
  });

  it("never returns an empty or all-zeros id", async () => {
    const id = await getStableDeviceId();
    expect(id).not.toBe("");
    expect(id).not.toBe("00000000-0000-0000-0000-000000000000");
  });

  it("yields distinct ids across separate installs", async () => {
    const installA = await getStableDeviceId();
    store.clear(); // simulate a different install / cleared storage
    const installB = await getStableDeviceId();
    expect(installB).not.toBe(installA);
  });
});
