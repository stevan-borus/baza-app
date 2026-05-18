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

import { POST } from "@/app/api/consent/social-media+api";
import { prisma } from "@/lib/server/prisma";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { resetDb } from "./setup-db";

describe("POST /api/consent/social-media", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: {
        email: "social-post@t.local",
        fullName: "Adult Social Poster",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
    });
    userId = user.id;
    setMockUser({
      id: user.id,
      role: "CLIENT",
      email: user.email,
      isActive: true,
      clientProfile: null,
    });
  });

  function makeReq(body: unknown, extraHeaders: Record<string, string> = {}) {
    return new Request("http://localhost/api/consent/social-media", {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  }

  it("writes a record with accepted=true", async () => {
    const res = await POST(makeReq({ accepted: true }));
    expect(res.status).toBe(200);
    const rec = await prisma.consentRecord.findFirstOrThrow({
      where: { userId, documentKey: "social_media" },
    });
    expect(rec.accepted).toBe(true);
    expect(rec.version).toBe(ACTIVE_VERSIONS.social_media);
  });

  it("writes a record with accepted=false (Ne is valid)", async () => {
    const res = await POST(makeReq({ accepted: false }));
    expect(res.status).toBe(200);
    const rec = await prisma.consentRecord.findFirstOrThrow({
      where: { userId, documentKey: "social_media" },
    });
    expect(rec.accepted).toBe(false);
  });

  it("captures IP / userAgent server-side, ignoring client-supplied fields", async () => {
    // Even if client tries to inject ipAddress/userAgent in body, server reads only from headers
    const res = await POST(
      makeReq(
        { accepted: true, ipAddress: "fake-client", userAgent: "fake-client" } as unknown as Record<string, unknown>,
        {
          "user-agent": "real-agent-1.0",
          "x-forwarded-for": "203.0.113.42",
        },
      ),
    );
    expect(res.status).toBe(200);
    const rec = await prisma.consentRecord.findFirstOrThrow({
      where: { userId, documentKey: "social_media" },
    });
    expect(rec.ipAddress).toBe("203.0.113.42");
    expect(rec.userAgent).toBe("real-agent-1.0");
  });

  it("each POST appends — prior rows preserved", async () => {
    await POST(makeReq({ accepted: true }));
    await POST(makeReq({ accepted: false }));
    const rows = await prisma.consentRecord.findMany({
      where: { userId, documentKey: "social_media" },
      orderBy: { acceptedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].accepted).toBe(true);
    expect(rows[1].accepted).toBe(false);
  });

  it("returns 400 on invalid payload", async () => {
    const res = await POST(makeReq({ accepted: "yes" }));
    expect(res.status).toBe(400);
  });

  it("allows ADMIN and TRAINER too", async () => {
    const admin = await prisma.user.create({
      data: { email: "admin-sm@t.local", fullName: "Admin SM", role: "ADMIN" },
    });
    setMockUser({ id: admin.id, role: "ADMIN", email: admin.email, isActive: true, clientProfile: null });
    const res = await POST(makeReq({ accepted: true }));
    expect(res.status).toBe(200);
  });
});
