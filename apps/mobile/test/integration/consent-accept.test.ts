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

import { POST } from "@/app/api/consent/accept+api";
import { prisma } from "@/lib/server/prisma";

describe("POST /api/consent/accept", () => {
  let userId: string;

  beforeEach(async () => {
    await prisma.consentRecord.deleteMany();
    await prisma.user.deleteMany();
    const user = await prisma.user.create({
      data: { email: "a@t.local", fullName: "A", role: "ADMIN" },
    });
    userId = user.id;
    setMockUser({
      id: user.id,
      role: "ADMIN",
      email: user.email,
      isActive: true,
      clientProfile: null,
    });
  });

  function makeReq(
    body: unknown,
    headers: Record<string, string> = {},
  ): Request {
    return new Request("https://t.local/api/consent/accept", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "vitest",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("writes a ConsentRecord with server-captured evidence", async () => {
    const res = await POST(
      makeReq({ documentKey: "tos", version: 1, locale: "sr" }),
    );
    expect(res.status).toBe(200);
    const rows = await prisma.consentRecord.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].ipAddress).toBe("203.0.113.7");
    expect(rows[0].userAgent).toBe("vitest");
    expect(rows[0].accepted).toBe(true);
  });

  it("rejects waiver_minor without guardian fields", async () => {
    const res = await POST(
      makeReq({ documentKey: "waiver_minor", version: 1, locale: "sr" }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts waiver_minor with guardian fields", async () => {
    const res = await POST(
      makeReq({
        documentKey: "waiver_minor",
        version: 1,
        locale: "sr",
        guardianName: "Marko Marković",
        guardianRelation: "parent",
      }),
    );
    expect(res.status).toBe(200);
    const row = await prisma.consentRecord.findFirst({
      where: { userId, documentKey: "waiver_minor" },
    });
    expect(row?.guardianName).toBe("Marko Marković");
    expect(row?.guardianRelation).toBe("parent");
  });

  it("ignores client-supplied ipAddress / userAgent fields", async () => {
    await POST(
      makeReq({
        documentKey: "tos",
        version: 1,
        locale: "sr",
        ipAddress: "10.0.0.1", // attempt to override
        userAgent: "spoofed",
      }),
    );
    const row = await prisma.consentRecord.findFirst({ where: { userId } });
    expect(row?.ipAddress).toBe("203.0.113.7");
    expect(row?.userAgent).toBe("vitest");
  });
});
