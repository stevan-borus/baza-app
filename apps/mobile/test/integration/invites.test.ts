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

vi.mock("@/lib/server/resend", () => ({
  sendInviteEmail: vi.fn(async () => undefined),
  sendResetEmail: vi.fn(async () => undefined),
  getResendClient: () => null,
}));

vi.mock("@/lib/server/auth", () => ({
  auth: {
    api: {
      signInEmail: vi.fn(async () => new Response("", { status: 200 })),
    },
  },
}));

import { POST as POST_INVITE } from "@/app/api/invites/+api";
import { POST as POST_RESEND } from "@/app/api/invites/[id]/resend/+api";
import { POST as POST_REVOKE } from "@/app/api/invites/[id]/revoke/+api";
import { POST as POST_COMPLETE } from "@/app/api/auth/complete-invite/+api";
import { generateRawToken, hashToken } from "@/lib/server/tokens";
import { now, nowMs } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import { sendInviteEmail } from "@/lib/server/resend";

const sendInviteEmailMock = vi.mocked(sendInviteEmail);

async function seedAdmin() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
  return admin;
}

function inviteRequest(body: unknown) {
  return new Request("http://test.local/api/invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("invites API", () => {
  beforeEach(async () => {
    await resetDb();
    sendInviteEmailMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST /api/invites creates a PENDING invite, hashes the token, and sends email", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "newclient@test.local",
        fullName: "New Client",
        phone: "+381 60 000 0000",
      }),
    );
    expect(response.status).toBe(200);

    const invites = await prisma.userInvite.findMany();
    expect(invites).toHaveLength(1);
    const [persisted] = invites;
    expect(persisted.status).toBe("PENDING");
    expect(persisted.email).toBe("newclient@test.local");
    expect(persisted.tokenHash.length).toBeGreaterThan(20);
    expect(sendInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "newclient@test.local" }),
    );
  });

  it("POST /api/invites returns 409 when the email already belongs to a user", async () => {
    await seedAdmin();
    await prisma.user.create({
      data: { email: "existing@test.local", fullName: "Existing", role: "CLIENT" },
    });
    const response = await POST_INVITE(
      inviteRequest({ email: "existing@test.local", fullName: "Existing" }),
    );
    expect(response.status).toBe(409);
    expect(await prisma.userInvite.count()).toBe(0);
    expect(sendInviteEmailMock).not.toHaveBeenCalled();
  });

  it("POST /api/auth/complete-invite consumes a valid token and creates the user + clientProfile", async () => {
    const admin = await seedAdmin();
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await prisma.userInvite.create({
      data: {
        email: "redeemer@test.local",
        fullName: "Redeemer",
        role: "CLIENT",
        tokenHash,
        expiresAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
    });

    const response = await POST_COMPLETE(
      new Request("http://test.local/api/auth/complete-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: rawToken, password: "Password123!" }),
      }),
    );
    expect(response.status).toBe(200);

    const invite = await prisma.userInvite.findFirst({
      where: { email: "redeemer@test.local" },
    });
    expect(invite?.status).toBe("COMPLETED");
    expect(invite?.invitedUserId).not.toBeNull();

    const created = await prisma.user.findUnique({
      where: { email: "redeemer@test.local" },
    });
    expect(created).not.toBeNull();
    expect(created?.role).toBe("CLIENT");
    expect(
      await prisma.clientProfile.findFirst({ where: { userId: created!.id } }),
    ).not.toBeNull();
  });

  it("POST /api/auth/complete-invite returns 410 and marks invite EXPIRED when the token is past expiry", async () => {
    const admin = await seedAdmin();
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const invite = await prisma.userInvite.create({
      data: {
        email: "expired@test.local",
        fullName: "Expired",
        role: "CLIENT",
        tokenHash,
        expiresAt: new Date(nowMs() - 60 * 1000),
        createdById: admin.id,
      },
    });

    const response = await POST_COMPLETE(
      new Request("http://test.local/api/auth/complete-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: rawToken, password: "Password123!" }),
      }),
    );
    expect(response.status).toBe(410);

    const updated = await prisma.userInvite.findUnique({ where: { id: invite.id } });
    expect(updated?.status).toBe("EXPIRED");
    expect(await prisma.user.findUnique({ where: { email: "expired@test.local" } })).toBeNull();
  });

  it("POST /api/auth/complete-invite returns 404 when the token is unknown", async () => {
    await seedAdmin();
    const response = await POST_COMPLETE(
      new Request("http://test.local/api/auth/complete-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "a".repeat(40), password: "Password123!" }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("POST /api/invites/:id/revoke flips PENDING → REVOKED", async () => {
    const admin = await seedAdmin();
    const invite = await prisma.userInvite.create({
      data: {
        email: "to-revoke@test.local",
        fullName: "To Revoke",
        role: "CLIENT",
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
    });
    const response = await POST_REVOKE(
      new Request(`http://test.local/api/invites/${invite.id}/revoke`, {
        method: "POST",
      }),
      { id: invite.id },
    );
    expect(response.status).toBe(200);
    const updated = await prisma.userInvite.findUnique({ where: { id: invite.id } });
    expect(updated?.status).toBe("REVOKED");
  });

  it("POST /api/invites/:id/resend rotates the token hash and re-sends the email", async () => {
    const admin = await seedAdmin();
    const oldTokenHash = hashToken(generateRawToken());
    const invite = await prisma.userInvite.create({
      data: {
        email: "to-resend@test.local",
        fullName: "To Resend",
        role: "CLIENT",
        tokenHash: oldTokenHash,
        expiresAt: new Date(nowMs() + 1000),
        createdById: admin.id,
      },
    });
    const response = await POST_RESEND(
      new Request(`http://test.local/api/invites/${invite.id}/resend`, {
        method: "POST",
      }),
      { id: invite.id },
    );
    expect(response.status).toBe(200);
    const updated = await prisma.userInvite.findUnique({ where: { id: invite.id } });
    expect(updated?.tokenHash).not.toBe(oldTokenHash);
    expect(updated?.expiresAt.getTime()).toBeGreaterThan(nowMs());
    expect(sendInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to-resend@test.local" }),
    );
  });

  it("POST /api/invites with dateOfBirth buffers it and hands it off on complete-invite", async () => {
    await seedAdmin();
    const inviteRes = await POST_INVITE(
      inviteRequest({
        email: "dob@test.local",
        fullName: "DOB Client",
        phone: "+381601234567",
        dateOfBirth: "1990-05-14",
      }),
    );
    expect(inviteRes.status).toBe(200);

    const invite = await prisma.userInvite.findFirst({
      where: { email: "dob@test.local" },
      select: { id: true, dateOfBirth: true, tokenHash: true },
    });
    expect(invite).not.toBeNull();
    expect(invite!.dateOfBirth?.toISOString().slice(0, 10)).toBe("1990-05-14");

    // Issue a fresh raw token tied to the same hashed token in the DB.
    // (sendInviteEmailMock recorded the original raw token in args.)
    const sentArgs = sendInviteEmailMock.mock.calls[0][0];
    const rawToken = sentArgs.inviteToken;

    const completeRes = await POST_COMPLETE(
      new Request("http://test.local/api/auth/complete-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: rawToken, password: "secret12345" }),
      }),
    );
    expect(completeRes.status).toBe(200);

    const profile = await prisma.clientProfile.findFirst({
      where: { user: { email: "dob@test.local" } },
      select: { dateOfBirth: true },
    });
    expect(profile).not.toBeNull();
    expect(profile!.dateOfBirth?.toISOString().slice(0, 10)).toBe("1990-05-14");
  });

  it("POST /api/invites rejects an invalid dateOfBirth", async () => {
    await seedAdmin();
    const res = await POST_INVITE(
      inviteRequest({
        email: "bad@test.local",
        fullName: "Bad DOB",
        dateOfBirth: "1990-02-30",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/invites/:id/revoke is rejected for already-revoked invites (only PENDING is revocable)", async () => {
    const admin = await seedAdmin();
    const invite = await prisma.userInvite.create({
      data: {
        email: "already-revoked@test.local",
        fullName: "X",
        role: "CLIENT",
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        status: "REVOKED",
        createdById: admin.id,
      },
    });
    const response = await POST_REVOKE(
      new Request(`http://test.local/api/invites/${invite.id}/revoke`, {
        method: "POST",
      }),
      { id: invite.id },
    );
    expect(response.status).toBe(400);
  });
});
