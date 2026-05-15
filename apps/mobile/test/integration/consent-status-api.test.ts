import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role))
        return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { GET } from "@/app/api/consent/status+api";
import { prisma } from "@/lib/server/prisma";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { resetDb } from "./setup-db";
import { consentStatusResponseSchema } from "@baza/types";

describe("GET /api/consent/status — social-media fields", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: {
        email: "social-status@t.local",
        fullName: "Adult Social",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
      include: { clientProfile: { select: { id: true } } },
    });
    userId = user.id;
    setMockUser({
      id: user.id,
      role: "CLIENT",
      email: user.email,
      isActive: true,
      clientProfile: user.clientProfile
        ? { id: user.clientProfile.id }
        : null,
    });
  });

  it("returns socialMediaDecided=false and socialMediaLatestAccepted=null for a fresh user", async () => {
    const res = await GET(new Request("http://localhost/api/consent/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.socialMediaDecided).toBe(false);
    expect(body.socialMediaLatestAccepted).toBeNull();
  });

  it("returns decided=true, latestAccepted=true after a Da row", async () => {
    await prisma.consentRecord.create({
      data: {
        userId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: true,
      },
    });
    const res = await GET(new Request("http://localhost/api/consent/status"));
    const body = await res.json();
    expect(body.socialMediaDecided).toBe(true);
    expect(body.socialMediaLatestAccepted).toBe(true);
  });

  it("returns decided=true, latestAccepted=false after a Ne row", async () => {
    await prisma.consentRecord.create({
      data: {
        userId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: false,
      },
    });
    const res = await GET(new Request("http://localhost/api/consent/status"));
    const body = await res.json();
    expect(body.socialMediaDecided).toBe(true);
    expect(body.socialMediaLatestAccepted).toBe(false);
  });

  it("payload parses cleanly through the Zod response schema (both new fields included)", async () => {
    await prisma.consentRecord.create({
      data: {
        userId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: true,
      },
    });
    const res = await GET(new Request("http://localhost/api/consent/status"));
    const body = await res.json();
    const parsed = consentStatusResponseSchema.parse(body);
    expect(parsed.socialMediaDecided).toBe(true);
    expect(parsed.socialMediaLatestAccepted).toBe(true);
  });
});
