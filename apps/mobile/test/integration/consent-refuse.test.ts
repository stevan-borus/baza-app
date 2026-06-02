import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { POST } from "@/app/api/consent/refuse+api";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

describe("POST /api/consent/refuse", () => {
  let adminId: string;
  let refusingUserId: string;

  beforeEach(async () => {
    await resetDb();

    const admin = await prisma.user.create({
      data: { email: "admin@t.local", firstName: "Admin", lastName: "Adminović", role: "ADMIN" },
    });
    const user = await prisma.user.create({
      data: {
        email: "u@t.local",
        firstName: "Refusing",
        lastName: "User",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
    });
    adminId = admin.id;
    refusingUserId = user.id;
    setMockUser({
      id: user.id,
      role: "CLIENT",
      email: user.email,
      isActive: true,
      clientProfile: { id: refusingUserId },
    });
  });

  it("creates a CONSENT_REFUSED notification for every admin", async () => {
    const res = await POST(
      new Request("https://t.local/api/consent/refuse", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const notifs = await prisma.notificationLog.findMany({
      where: { userId: adminId, type: "CONSENT_REFUSED" },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toContain("Refusing User");
  });

  it("notifies multiple admins", async () => {
    // Add a second admin
    await prisma.user.create({
      data: { email: "admin2@t.local", firstName: "Admin", lastName: "Two", role: "ADMIN" },
    });
    await POST(
      new Request("https://t.local/api/consent/refuse", { method: "POST" }),
    );
    const notifs = await prisma.notificationLog.findMany({
      where: { type: "CONSENT_REFUSED" },
    });
    expect(notifs).toHaveLength(2);
  });
});
