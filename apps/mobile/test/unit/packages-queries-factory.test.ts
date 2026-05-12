/**
 * Unit test for packagesQueries.clientPackagesAdminList — asserts the
 * infinite-query factory builds the correct URL for each combination of
 * { search, take, cursor }. Mirrors clients-queries-factory.test.ts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { packagesQueries } from "@/lib/queries/packages-queries-factory";

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

const emptyOk = { success: true, packages: [], nextCursor: null };

describe("packagesQueries.clientPackagesAdminList — URL building", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockReturnValue(jsonResponse(emptyOk));
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("first page with no search and default take=20", async () => {
    const opts = packagesQueries.clientPackagesAdminList();
    await opts.queryFn!({ pageParam: null } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/packages/client-packages");
    expect(url).toContain("take=20");
    expect(url).not.toContain("cursor=");
    expect(url).not.toContain("search=");
  });

  it("includes search when provided", async () => {
    const opts = packagesQueries.clientPackagesAdminList({ search: "ana" });
    await opts.queryFn!({ pageParam: null } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("search=ana");
    expect(url).toContain("take=20");
  });

  it("includes cursor when pageParam is provided", async () => {
    const opts = packagesQueries.clientPackagesAdminList({
      search: "ana",
      take: 50,
    });
    await opts.queryFn!({ pageParam: "cursor-abc" } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("cursor=cursor-abc");
    expect(url).toContain("search=ana");
    expect(url).toContain("take=50");
  });

  it("honors a custom take", async () => {
    const opts = packagesQueries.clientPackagesAdminList({ take: 50 });
    await opts.queryFn!({ pageParam: null } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("take=50");
  });

  it("queryKey distinguishes by search and take", () => {
    const a = packagesQueries.clientPackagesAdminList({
      search: "ana",
      take: 20,
    }).queryKey;
    const b = packagesQueries.clientPackagesAdminList({
      search: "bob",
      take: 20,
    }).queryKey;
    const c = packagesQueries.clientPackagesAdminList({
      search: "ana",
      take: 50,
    }).queryKey;
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("getNextPageParam returns nextCursor from the last page", () => {
    const opts = packagesQueries.clientPackagesAdminList();
    const next = opts.getNextPageParam!(
      { success: true, packages: [], nextCursor: "abc-cursor" } as never,
      [] as never,
      null as never,
      [] as never,
    );
    expect(next).toBe("abc-cursor");
  });

  it("getNextPageParam returns null when no more pages", () => {
    const opts = packagesQueries.clientPackagesAdminList();
    const next = opts.getNextPageParam!(
      { success: true, packages: [], nextCursor: null } as never,
      [] as never,
      null as never,
      [] as never,
    );
    expect(next).toBeFalsy();
  });
});
