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

import { GET as GET_INVITES, POST as POST_INVITE } from "@/server/routes/invites";
import { POST as POST_RESEND } from "@/server/routes/invites/[id]/resend";
import { POST as POST_REVOKE } from "@/server/routes/invites/[id]/revoke";
import { POST as POST_COMPLETE } from "@/server/routes/auth/complete-invite";
import { generateRawToken, hashToken } from "@/lib/server/tokens";
import { now, nowMs } from "@/lib/now";
import { studioDayStartFor } from "@/lib/studio-time";
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
      invite: {
        firstName: string;
        lastName: string;
        phone: string | null;
        fullName: string;
        role: string;
      };
    };
    expect(createBody.invite.firstName).toBe("New");
    expect(createBody.invite.lastName).toBe("Client");
    expect(createBody.invite.phone).toBe("+381 60 000 0000");
    expect(createBody.invite.role).toBe("CLIENT");
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
        role: string;
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
    expect(revokeBody.invite.role).toBe("CLIENT");
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
        role: string;
      };
    };
    expect(resendBody.success).toBe(true);
    expect(resendBody.invite.id).toBe(invite.id);
    expect(resendBody.invite.email).toBe("to-resend@test.local");
    expect(resendBody.invite.firstName).toBe("To");
    expect(resendBody.invite.lastName).toBe("Resend");
    expect(resendBody.invite.status).toBe("PENDING");
    expect(resendBody.invite.fullName).toBe("To Resend");
    expect(resendBody.invite.role).toBe("CLIENT");
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

  it("POST /api/invites with role TRAINER creates a TRAINER invite without dateOfBirth", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "trainer@test.local",
        firstName: "Trener",
        lastName: "Novi",
        phone: "+381601112222",
        role: "TRAINER",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { invite: { role: string; fullName: string } };
    expect(body.invite.role).toBe("TRAINER");
    expect(body.invite.fullName).toBe("Trener Novi");

    const persisted = await prisma.userInvite.findFirst({
      where: { email: "trainer@test.local" },
    });
    expect(persisted?.role).toBe("TRAINER");
    expect(persisted?.dateOfBirth).toBeNull();
    expect(sendInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "trainer@test.local" }),
    );
  });

  it("POST /api/invites ignores a stray dateOfBirth on a TRAINER invite (nothing consumes it)", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "trainer-dob@test.local",
        firstName: "Trener",
        lastName: "Rodjendan",
        role: "TRAINER",
        dateOfBirth: "1985-03-03",
      }),
    );
    expect(response.status).toBe(200);
    const persisted = await prisma.userInvite.findFirst({
      where: { email: "trainer-dob@test.local" },
    });
    expect(persisted?.dateOfBirth).toBeNull();
  });

  it("POST /api/invites defaults to CLIENT and returns role on the response", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "defaulted@test.local",
        firstName: "Default",
        lastName: "Client",
        dateOfBirth: "1992-02-02",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { invite: { role: string } };
    expect(body.invite.role).toBe("CLIENT");
  });

  it("POST /api/invites rejects role ADMIN with 400", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "sneaky@test.local",
        firstName: "Sneaky",
        lastName: "Admin",
        role: "ADMIN",
      }),
    );
    expect(response.status).toBe(400);
    expect(await prisma.userInvite.count()).toBe(0);
  });

  it("POST /api/invites rejects a CLIENT invite missing dateOfBirth with 400", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "no-dob@test.local",
        firstName: "No",
        lastName: "Dob",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("POST /api/invites is forbidden for a TRAINER caller — trainers cannot mint invites", async () => {
    const trainer = await prisma.user.create({
      data: { email: "trainer-caller@test.local", firstName: "T", lastName: "C", role: "TRAINER" },
    });
    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });
    const response = await POST_INVITE(
      inviteRequest({
        email: "victim@test.local",
        firstName: "V",
        lastName: "W",
        role: "TRAINER",
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.userInvite.count()).toBe(0);
  });

  it("GET /api/invites returns each invite's role", async () => {
    const admin = await seedAdmin();
    await prisma.userInvite.create({
      data: {
        email: "listed-trainer@test.local",
        firstName: "Listed",
        lastName: "Trainer",
        role: "TRAINER",
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
    });
    const response = await GET_INVITES(new Request("http://test.local/api/invites"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { invites: Array<{ email: string; role: string }> };
    expect(body.invites.find((i) => i.email === "listed-trainer@test.local")?.role).toBe("TRAINER");
  });

  it("POST /api/auth/complete-invite on a TRAINER invite creates a TRAINER user with no clientProfile", async () => {
    const admin = await seedAdmin();
    const rawToken = generateRawToken();
    await prisma.userInvite.create({
      data: {
        email: "trainer-redeem@test.local",
        firstName: "Redeem",
        lastName: "Trainer",
        role: "TRAINER",
        tokenHash: hashToken(rawToken),
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
    const created = await prisma.user.findUnique({
      where: { email: "trainer-redeem@test.local" },
    });
    expect(created?.role).toBe("TRAINER");
    expect(
      await prisma.clientProfile.findFirst({ where: { userId: created!.id } }),
    ).toBeNull();
  });

  it("POST /api/invites persists trainerPercent on a TRAINER invite and returns it", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "trainer-percent@test.local",
        firstName: "Trener",
        lastName: "Procenat",
        role: "TRAINER",
        trainerPercent: 40,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invite: { trainerPercent: number | null };
    };
    expect(body.invite.trainerPercent).toBe(40);

    const persisted = await prisma.userInvite.findFirst({
      where: { email: "trainer-percent@test.local" },
    });
    expect(persisted?.trainerPercent).toBe(40);
  });

  it("POST /api/invites rejects trainerPercent on a CLIENT invite with 400", async () => {
    await seedAdmin();
    const response = await POST_INVITE(
      inviteRequest({
        email: "client-percent@test.local",
        firstName: "Klijent",
        lastName: "Procenat",
        dateOfBirth: "1990-05-14",
        trainerPercent: 40,
      }),
    );
    expect(response.status).toBe(400);
    expect(
      await prisma.userInvite.findFirst({
        where: { email: "client-percent@test.local" },
      }),
    ).toBeNull();
  });

  it("complete-invite seeds the trainer's first rate from the invite's trainerPercent", async () => {
    const admin = await seedAdmin();
    const rawToken = generateRawToken();
    await prisma.userInvite.create({
      data: {
        email: "trainer-rate-seed@test.local",
        firstName: "Rate",
        lastName: "Seed",
        role: "TRAINER",
        trainerPercent: 45,
        tokenHash: hashToken(rawToken),
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

    const created = await prisma.user.findUnique({
      where: { email: "trainer-rate-seed@test.local" },
    });
    const rates = await prisma.trainerRate.findMany({
      where: { trainerUserId: created!.id },
    });
    expect(rates).toHaveLength(1);
    expect(rates[0]!.percent).toBe(45);
    expect(rates[0]!.createdByUserId).toBe(admin.id);
    // Same studio-day boundary the rates POST route stamps, so an
    // invite-seeded rate is indistinguishable from a hand-set one.
    expect(rates[0]!.effectiveFrom.toISOString()).toBe(
      studioDayStartFor(now()).toISOString(),
    );
  });

  it("complete-invite on a TRAINER invite without a percent creates no rate", async () => {
    const admin = await seedAdmin();
    const rawToken = generateRawToken();
    await prisma.userInvite.create({
      data: {
        email: "trainer-no-rate@test.local",
        firstName: "No",
        lastName: "Rate",
        role: "TRAINER",
        tokenHash: hashToken(rawToken),
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

    const created = await prisma.user.findUnique({
      where: { email: "trainer-no-rate@test.local" },
    });
    expect(
      await prisma.trainerRate.findMany({ where: { trainerUserId: created!.id } }),
    ).toHaveLength(0);
  });

  it("GET /api/invites returns each invite's trainerPercent", async () => {
    const admin = await seedAdmin();
    await prisma.userInvite.create({
      data: {
        email: "listed-percent@test.local",
        firstName: "Listed",
        lastName: "Percent",
        role: "TRAINER",
        trainerPercent: 55,
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(nowMs() + 60_000),
        createdById: admin.id,
      },
    });

    const response = await GET_INVITES(new Request("http://test.local/api/invites"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invites: Array<{ email: string; trainerPercent: number | null }>;
    };
    expect(
      body.invites.find((i) => i.email === "listed-percent@test.local")
        ?.trainerPercent,
    ).toBe(55);
  });

  it("revoke and resend keep trainerPercent on the spliced row", async () => {
    const admin = await seedAdmin();
    const resendInvite = await prisma.userInvite.create({
      data: {
        email: "percent-resend@test.local",
        firstName: "Percent",
        lastName: "Resend",
        role: "TRAINER",
        trainerPercent: 30,
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(nowMs() + 60_000),
        createdById: admin.id,
      },
    });
    const revokeInvite = await prisma.userInvite.create({
      data: {
        email: "percent-revoke@test.local",
        firstName: "Percent",
        lastName: "Revoke",
        role: "TRAINER",
        trainerPercent: 35,
        tokenHash: hashToken(generateRawToken()),
        expiresAt: new Date(nowMs() + 60_000),
        createdById: admin.id,
      },
    });

    const resent = (await (
      await POST_RESEND(
        new Request("http://test.local/api/invites/x/resend", { method: "POST" }),
        { id: resendInvite.id },
      )
    ).json()) as { invite: { trainerPercent: number | null } };
    expect(resent.invite.trainerPercent).toBe(30);

    const revoked = (await (
      await POST_REVOKE(
        new Request("http://test.local/api/invites/x/revoke", { method: "POST" }),
        { id: revokeInvite.id },
      )
    ).json()) as { invite: { trainerPercent: number | null } };
    expect(revoked.invite.trainerPercent).toBe(35);
  });
});
