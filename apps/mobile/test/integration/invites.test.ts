import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

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

import { POST as POST_INVITE } from "@/server/routes/invites";
import { POST as POST_RESEND } from "@/server/routes/invites/[id]/resend";
import { POST as POST_REVOKE } from "@/server/routes/invites/[id]/revoke";
import { POST as POST_COMPLETE } from "@/server/routes/auth/complete-invite";
import { generateRawToken, hashToken } from "@/lib/server/tokens";
import { now, nowMs } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import { sendInviteEmail } from "@/lib/server/resend";

const sendInviteEmailMock = vi.mocked(sendInviteEmail);

async function seedAdmin() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
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
        firstName: "New",
        lastName: "Client",
        phone: "+381 60 000 0000",
        dateOfBirth: "1990-01-01",
      }),
    );
    expect(response.status).toBe(200);

    const createBody = (await response.json()) as {
      invite: { firstName: string; lastName: string; phone: string | null; fullName: string };
    };
    expect(createBody.invite.firstName).toBe("New");
    expect(createBody.invite.lastName).toBe("Client");
    expect(createBody.invite.phone).toBe("+381 60 000 0000");
    // The cache splice parses the response through the client invite row schema,
    // which requires a derived fullName — assert the server provides it.
    expect(createBody.invite.fullName).toBe("New Client");

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
      data: { email: "existing@test.local", firstName: "Existing", lastName: "User", role: "CLIENT" },
    });
    const response = await POST_INVITE(
      inviteRequest({
        email: "existing@test.local",
        firstName: "Existing",
        lastName: "User",
        dateOfBirth: "1990-01-01",
      }),
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
        firstName: "Redeemer",
        lastName: "Test",
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
    // Session issuance is the client's job (authClient sign-in after
    // redemption) — the invite endpoint itself must not mint one.
    expect(response.headers.get("set-cookie")).toBeNull();

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
        firstName: "Expired",
        lastName: "Test",
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
        firstName: "To",
        lastName: "Revoke",
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
    const revokeBody = (await response.json()) as {
      success: boolean;
      invite: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        status: string;
        fullName: string;
      };
    };
    expect(revokeBody.success).toBe(true);
    expect(revokeBody.invite.id).toBe(invite.id);
    expect(revokeBody.invite.email).toBe("to-revoke@test.local");
    expect(revokeBody.invite.firstName).toBe("To");
    expect(revokeBody.invite.lastName).toBe("Revoke");
    expect(revokeBody.invite.status).toBe("REVOKED");
    // fullName must be present — the cache splice's schema parse requires it.
    expect(revokeBody.invite.fullName).toBe("To Revoke");
    const updated = await prisma.userInvite.findUnique({ where: { id: invite.id } });
    expect(updated?.status).toBe("REVOKED");
  });

  it("POST /api/invites/:id/resend rotates the token hash and re-sends the email", async () => {
    const admin = await seedAdmin();
    const oldTokenHash = hashToken(generateRawToken());
    const invite = await prisma.userInvite.create({
      data: {
        email: "to-resend@test.local",
        firstName: "To",
        lastName: "Resend",
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
    const resendBody = (await response.json()) as {
      success: boolean;
      invite: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        status: string;
        fullName: string;
      };
    };
    expect(resendBody.success).toBe(true);
    expect(resendBody.invite.id).toBe(invite.id);
    expect(resendBody.invite.email).toBe("to-resend@test.local");
    expect(resendBody.invite.firstName).toBe("To");
    expect(resendBody.invite.lastName).toBe("Resend");
    expect(resendBody.invite.status).toBe("PENDING");
    expect(resendBody.invite.fullName).toBe("To Resend");
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
        firstName: "DOB",
        lastName: "Client",
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
        firstName: "Bad",
        lastName: "DOB",
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
        firstName: "Already",
        lastName: "Revoked",
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
