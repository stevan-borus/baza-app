/**
 * Unit test for clientsQueries.list — asserts the infinite-query factory
 * builds the correct URL for each combination of { q, take, cursor }. The
 * goal is to guarantee the network contract independently of any UI consumer:
 * no consumer can accidentally drop a param when wiring its own infinite query.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Stub the env so the factory has a deterministic API_URL to build against.
vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { clientsQueries } from "@/lib/queries/clients-queries-factory";

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

const emptyOk = { success: true, clients: [], nextCursor: null };

describe("clientsQueries.list — URL building", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockReturnValue(jsonResponse(emptyOk));
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("first page with no q and default take=20", async () => {
    const opts = clientsQueries.list();
    await opts.queryFn!({ pageParam: null } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/clients");
    expect(url).toContain("take=20");
    expect(url).not.toContain("cursor=");
    expect(url).not.toContain("q=");
  });

  it("includes q when provided", async () => {
    const opts = clientsQueries.list({ q: "alice" });
    await opts.queryFn!({ pageParam: null } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("q=alice");
    expect(url).toContain("take=20");
  });

  it("includes cursor when pageParam is provided", async () => {
    const opts = clientsQueries.list({ q: "alice", take: 50 });
    await opts.queryFn!({ pageParam: "cursor-abc" } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("cursor=cursor-abc");
    expect(url).toContain("q=alice");
    expect(url).toContain("take=50");
  });

  it("honors a custom take", async () => {
    const opts = clientsQueries.list({ take: 50 });
    await opts.queryFn!({ pageParam: null } as never);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("take=50");
  });

  it("queryKey distinguishes by q and take", () => {
    const a = clientsQueries.list({ q: "alice", take: 20 }).queryKey;
    const b = clientsQueries.list({ q: "bob", take: 20 }).queryKey;
    const c = clientsQueries.list({ q: "alice", take: 50 }).queryKey;
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("getNextPageParam returns nextCursor from the last page", () => {
    const opts = clientsQueries.list();
    const next = opts.getNextPageParam!(
      { success: true, clients: [], nextCursor: "abc-cursor" } as never,
      [] as never,
      null as never,
      [] as never,
    );
    expect(next).toBe("abc-cursor");
  });

  it("getNextPageParam returns null when no more pages", () => {
    const opts = clientsQueries.list();
    const next = opts.getNextPageParam!(
      { success: true, clients: [], nextCursor: null } as never,
      [] as never,
      null as never,
      [] as never,
    );
    expect(next).toBeFalsy();
  });
});
