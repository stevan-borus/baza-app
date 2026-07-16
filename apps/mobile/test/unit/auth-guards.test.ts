import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: { user: { findUnique: findUniqueMock } },
}));

// Import AFTER mocks so the module-level imports resolve to the mocks.
const { getRequestUser, requireRole } = await import(
  "@/lib/server/auth-guards"
);

function makeRequest() {
  return new Request("http://test.local/", { headers: { cookie: "x=1" } });
}

// The customSession plugin enriches getSession's `user` with the fields the
// guard needs (role, email, first/last name, isActive, clientProfileId), so
// getRequestUser trusts the session and does NOT re-fetch the user row.
const FIXED_CREATED_AT = new Date("2024-01-01T00:00:00.000Z");

function enrichedSession(user: {
  id: string;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  clientProfileId: string | null;
}) {
  return { user: { ...user, createdAt: FIXED_CREATED_AT } };
}

afterEach(() => {
  getSessionMock.mockReset();
  findUniqueMock.mockReset();
});

describe("getRequestUser", () => {
  it("returns null when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const user = await getRequestUser(makeRequest());
    expect(user).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns null when the session's user has been deactivated", async () => {
    getSessionMock.mockResolvedValueOnce(
      enrichedSession({
        id: "user-1",
        role: "CLIENT",
        email: "deactivated@test.local",
        firstName: "Deactivated",
        lastName: "User",
        isActive: false,
        clientProfileId: null,
      }),
    );
    const user = await getRequestUser(makeRequest());
    expect(user).toBeNull();
  });

  it("returns the active user from the session without re-fetching the row", async () => {
    getSessionMock.mockResolvedValueOnce(
      enrichedSession({
        id: "user-2",
        role: "ADMIN",
        email: "admin@test.local",
        firstName: "Ana",
        lastName: "Petrović",
        isActive: true,
        clientProfileId: null,
      }),
    );
    const user = await getRequestUser(makeRequest());
    expect(user).toEqual({
      id: "user-2",
      role: "ADMIN",
      email: "admin@test.local",
      firstName: "Ana",
      lastName: "Petrović",
      fullName: "Ana Petrović",
      isActive: true,
      createdAt: FIXED_CREATED_AT,
      clientProfile: null,
    });
    // The whole point of the cheap fix: no redundant DB round-trip.
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("maps an enriched clientProfileId to the clientProfile shape consumers expect", async () => {
    getSessionMock.mockResolvedValueOnce(
      enrichedSession({
        id: "client-9",
        role: "CLIENT",
        email: "client@test.local",
        firstName: "Marko",
        lastName: "Marković",
        isActive: true,
        clientProfileId: "profile-9",
      }),
    );
    const user = await getRequestUser(makeRequest());
    expect(user?.clientProfile).toEqual({ id: "profile-9" });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("returns a 401 response when there is no authenticated user", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const result = await requireRole(makeRequest(), ["ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns a 403 response when the user's role is not allowed", async () => {
    getSessionMock.mockResolvedValueOnce(
      enrichedSession({
        id: "client-1",
        role: "CLIENT",
        email: "client@test.local",
        firstName: "Client",
        lastName: "One",
        isActive: true,
        clientProfileId: "profile-1",
      }),
    );
    const result = await requireRole(makeRequest(), ["ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("returns ok with the user when their role is in the allowed list", async () => {
    getSessionMock.mockResolvedValueOnce(
      enrichedSession({
        id: "admin-1",
        role: "ADMIN",
        email: "admin@test.local",
        firstName: "Admin",
        lastName: "One",
        isActive: true,
        clientProfileId: null,
      }),
    );
    const result = await requireRole(makeRequest(), ["ADMIN"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("admin-1");
      expect(result.user.role).toBe("ADMIN");
    }
  });

  it("accepts a user whose role is one of several allowed roles", async () => {
    getSessionMock.mockResolvedValueOnce(
      enrichedSession({
        id: "trainer-1",
        role: "TRAINER",
        email: "trainer@test.local",
        firstName: "Trainer",
        lastName: "One",
        isActive: true,
        clientProfileId: null,
      }),
    );
    const result = await requireRole(makeRequest(), ["ADMIN", "TRAINER"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("TRAINER");
    }
  });
});
