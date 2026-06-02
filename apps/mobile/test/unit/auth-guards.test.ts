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
    getSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    findUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      role: "CLIENT",
      email: "deactivated@test.local",
      firstName: "Deactivated",
      lastName: "User",
      isActive: false,
      clientProfile: null,
    });
    const user = await getRequestUser(makeRequest());
    expect(user).toBeNull();
  });

  it("returns the active user when the session matches a real DB row", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "user-2" } });
    findUniqueMock.mockResolvedValueOnce({
      id: "user-2",
      role: "ADMIN",
      email: "admin@test.local",
      firstName: "Ana",
      lastName: "Petrović",
      isActive: true,
      clientProfile: null,
    });
    const user = await getRequestUser(makeRequest());
    expect(user).toEqual({
      id: "user-2",
      role: "ADMIN",
      email: "admin@test.local",
      firstName: "Ana",
      lastName: "Petrović",
      fullName: "Ana Petrović",
      isActive: true,
      clientProfile: null,
    });
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
    getSessionMock.mockResolvedValueOnce({ user: { id: "client-1" } });
    findUniqueMock.mockResolvedValueOnce({
      id: "client-1",
      role: "CLIENT",
      email: "client@test.local",
      firstName: "Client",
      lastName: "One",
      isActive: true,
      clientProfile: { id: "profile-1" },
    });
    const result = await requireRole(makeRequest(), ["ADMIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("returns ok with the user when their role is in the allowed list", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "admin-1" } });
    findUniqueMock.mockResolvedValueOnce({
      id: "admin-1",
      role: "ADMIN",
      email: "admin@test.local",
      firstName: "Admin",
      lastName: "One",
      isActive: true,
      clientProfile: null,
    });
    const result = await requireRole(makeRequest(), ["ADMIN"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("admin-1");
      expect(result.user.role).toBe("ADMIN");
    }
  });

  it("accepts a user whose role is one of several allowed roles", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "trainer-1" } });
    findUniqueMock.mockResolvedValueOnce({
      id: "trainer-1",
      role: "TRAINER",
      email: "trainer@test.local",
      firstName: "Trainer",
      lastName: "One",
      isActive: true,
      clientProfile: null,
    });
    const result = await requireRole(makeRequest(), ["ADMIN", "TRAINER"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("TRAINER");
    }
  });
});
