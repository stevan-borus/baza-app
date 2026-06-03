import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

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

import { GET, PATCH } from "@/app/api/notifications/preferences/+api";
import { prisma } from "@/lib/server/prisma";

async function seedClient() {
  const user = await prisma.user.create({
    data: { email: "c@test.local", firstName: "Mara", lastName: "K", role: "CLIENT" },
  });
  setMockUser({ id: user.id, role: "CLIENT", email: user.email, isActive: true, clientProfile: null });
  return user;
}

function patchReq(body: unknown) {
  return new Request("http://test.local/api/notifications/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("notification preferences flags", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET returns both new flags defaulting to true", async () => {
    await seedClient();
    const res = await GET(new Request("http://test.local/api/notifications/preferences"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.campaignsEnabled).toBe(true);
    expect(body.preferences.bookingEmailsEnabled).toBe(true);
  });

  it("PATCH persists bookingEmailsEnabled=false without touching campaignsEnabled", async () => {
    await seedClient();
    const res = await PATCH(patchReq({ bookingEmailsEnabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.bookingEmailsEnabled).toBe(false);
    expect(body.preferences.campaignsEnabled).toBe(true);
  });

  it("PATCH persists campaignsEnabled=false", async () => {
    await seedClient();
    const res = await PATCH(patchReq({ campaignsEnabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.campaignsEnabled).toBe(false);
  });
});
