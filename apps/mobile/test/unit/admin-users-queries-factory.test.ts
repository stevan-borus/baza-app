/**
 * adminUsersQueries + useUnlockUserMutation.
 *
 * Two contracts worth pinning without a renderer: the list query hits the
 * staff endpoint, and a successful unlock invalidates BOTH caches that can
 * show a padlock — the staff roster and the client detail (which lives under
 * the ["clients"] key). Miss the second and an admin unlocks a client from
 * their profile and watches the badge sit there until a manual refresh.
 *
 * The mutation hook is exercised through a real MutationObserver against a
 * real QueryClient rather than a render: assertions read observable cache
 * state (`isInvalidated`), never a spy on invalidateQueries.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { MutationObserver, QueryClient } from "@tanstack/react-query";
import {
  adminUsersQueries,
  unlockUserMutationOptions,
} from "@/lib/queries/admin-users-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

const UNLOCK_OK = {
  success: true,
  user: { id: "user-1", lockedUntil: null },
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe("adminUsersQueries.list", () => {
  it("requests the staff endpoint and parses the response", async () => {
    fetchMock.mockReturnValue(
      jsonResponse({
        success: true,
        users: [
          {
            id: "u1",
            firstName: "Ana",
            lastName: "Anić",
            fullName: "Ana Anić",
            email: "ana@baza.test",
            role: "TRAINER",
            lockedUntil: null,
          },
        ],
      }),
    );

    const data = await adminUsersQueries.list().queryFn!({} as never);

    expect(fetchMock.mock.calls[0][0]).toContain("/api/admin/users");
    expect(data.users[0]).toMatchObject({ id: "u1", role: "TRAINER" });
  });

  it("keys the list under the shared `admin-users` root", () => {
    expect(adminUsersQueries.list().queryKey[0]).toBe(
      adminUsersQueries.all[0],
    );
  });
});

describe("useUnlockUserMutation — invalidations", () => {
  it("posts to the unlock endpoint for the given id", async () => {
    fetchMock.mockReturnValue(jsonResponse(UNLOCK_OK));
    const client = new QueryClient();

    await new MutationObserver(
      client,
      unlockUserMutationOptions(client),
    ).mutate({ id: "user-1" });

    expect(fetchMock.mock.calls[0][0]).toContain(
      "/api/admin/users/user-1/unlock",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("invalidates the staff roster AND the client caches on success", async () => {
    fetchMock.mockReturnValue(jsonResponse(UNLOCK_OK));
    const client = new QueryClient();

    // Seed both caches so "invalidated" is observable on real entries.
    client.setQueryData(adminUsersQueries.list().queryKey, {
      success: true,
      users: [],
    });
    client.getQueryCache().build(client, {
      queryKey: clientsQueries.byId("client-1").queryKey,
    }).setData({ success: true } as never);

    await new MutationObserver(
      client,
      unlockUserMutationOptions(client),
    ).mutate({ id: "user-1" });

    const staff = client
      .getQueryCache()
      .find({ queryKey: adminUsersQueries.list().queryKey });
    const clientDetail = client
      .getQueryCache()
      .find({ queryKey: clientsQueries.byId("client-1").queryKey });

    expect(staff?.state.isInvalidated).toBe(true);
    expect(clientDetail?.state.isInvalidated).toBe(true);
  });

  it("leaves the caches alone when the unlock fails", async () => {
    fetchMock.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      }),
    );
    const client = new QueryClient();
    client.setQueryData(adminUsersQueries.list().queryKey, {
      success: true,
      users: [],
    });

    await new MutationObserver(client, {
      ...unlockUserMutationOptions(client),
      retry: false,
    })
      .mutate({ id: "user-1" })
      .catch(() => {});

    const staff = client
      .getQueryCache()
      .find({ queryKey: adminUsersQueries.list().queryKey });
    expect(staff?.state.isInvalidated).toBe(false);
  });
});
