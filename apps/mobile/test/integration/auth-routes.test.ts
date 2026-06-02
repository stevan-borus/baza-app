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
      signOut: vi.fn(async () => new Response("", { status: 200 })),
    },
  },
}));

import { GET as GET_ME } from "@/app/api/auth/me/+api";
import { POST as POST_SIGN_OUT } from "@/app/api/auth/sign-out/+api";
import { POST as POST_REQ_RESET } from "@/app/api/auth/request-password-reset/+api";
import { POST as POST_RESET } from "@/app/api/auth/reset-password/+api";
import { hashPassword } from "@/lib/server/password";
import { now, nowMs } from "@/lib/now";
import { generateRawToken, hashToken } from "@/lib/server/tokens";
import { prisma } from "@/lib/server/prisma";
import { sendResetEmail } from "@/lib/server/resend";

const sendResetEmailMock = vi.mocked(sendResetEmail);

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  beforeEach(async () => {
    await resetDb();
    sendResetEmailMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 when no user is authenticated", async () => {
      setMockUser(null);
      const response = await GET_ME(new Request("http://test.local/api/auth/me"));
      expect(response.status).toBe(401);
    });

    it("returns the active user payload when authenticated", async () => {
      const user = await prisma.user.create({
        data: {
          email: "u@test.local",
          firstName: "Ana",
          lastName: "Petrović",
          role: "ADMIN",
        },
      });
      setMockUser({
        id: user.id,
        role: "ADMIN",
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        isActive: true,
        clientProfile: null,
      });
      const response = await GET_ME(new Request("http://test.local/api/auth/me"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        user: {
          id: string;
          role: string;
          firstName: string;
          lastName: string;
          fullName: string;
        };
      };
      expect(body.user.id).toBe(user.id);
      expect(body.user.role).toBe("ADMIN");
      expect(body.user.firstName).toBe("Ana");
      expect(body.user.lastName).toBe("Petrović");
      expect(body.user.fullName).toBe("Ana Petrović");
    });
  });

  describe("POST /api/auth/sign-out", () => {
    it("deactivates the caller's active push tokens before signing out", async () => {
      const user = await prisma.user.create({
        data: { email: "p@test.local", firstName: "Petar", lastName: "Test", role: "CLIENT" },
      });
      await prisma.pushToken.create({
        data: {
          userId: user.id,
          deviceId: "device-1",
          expoPushToken: "ExpoPushToken[abc]",
          isActive: true,
        },
      });
      setMockUser({
        id: user.id,
        role: "CLIENT",
        email: user.email,
        isActive: true,
        clientProfile: null,
      });

      const response = await POST_SIGN_OUT(
        new Request("http://test.local/api/auth/sign-out", { method: "POST" }),
      );
      expect(response.status).toBe(200);
      const updated = await prisma.pushToken.findFirst({
        where: { userId: user.id },
      });
      expect(updated?.isActive).toBe(false);
    });
  });

  describe("POST /api/auth/request-password-reset", () => {
    it("creates a hashed reset token and sends an email when the user exists", async () => {
      const user = await prisma.user.create({
        data: {
          email: "reset@test.local",
          firstName: "Reset",
          lastName: "Test",
          role: "CLIENT",
          isActive: true,
        },
      });
      const response = await POST_REQ_RESET(
        jsonRequest("http://test.local/api/auth/request-password-reset", {
          email: user.email,
        }),
      );
      expect(response.status).toBe(200);

      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      expect(tokens).toHaveLength(1);
      expect(sendResetEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email }),
      );
    });

    it("returns 200 but does not create a token for unknown emails (avoid enumeration)", async () => {
      const response = await POST_REQ_RESET(
        jsonRequest("http://test.local/api/auth/request-password-reset", {
          email: "ghost@test.local",
        }),
      );
      expect(response.status).toBe(200);
      expect(await prisma.passwordResetToken.count()).toBe(0);
      expect(sendResetEmailMock).not.toHaveBeenCalled();
    });

    it("returns 200 but does not create a token for deactivated users", async () => {
      await prisma.user.create({
        data: {
          email: "off@test.local",
          firstName: "Off",
          lastName: "Test",
          role: "CLIENT",
          isActive: false,
        },
      });
      const response = await POST_REQ_RESET(
        jsonRequest("http://test.local/api/auth/request-password-reset", {
          email: "off@test.local",
        }),
      );
      expect(response.status).toBe(200);
      expect(await prisma.passwordResetToken.count()).toBe(0);
      expect(sendResetEmailMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/reset-password", () => {
    async function seedUserWithResetToken(opts?: {
      expiresInMs?: number;
      usedAt?: Date | null;
    }) {
      const user = await prisma.user.create({
        data: {
          email: "rp@test.local",
          firstName: "Reset",
          lastName: "Password",
          role: "CLIENT",
          isActive: true,
          passwordHash: await hashPassword("OldPassword123!"),
        },
      });
      await prisma.authAccount.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: user.passwordHash,
        },
      });
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(nowMs() + (opts?.expiresInMs ?? 30 * 60 * 1000));
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          usedAt: opts?.usedAt ?? null,
        },
      });
      return { user, rawToken };
    }

    it("rotates the user's passwordHash + authAccount password and marks the token used", async () => {
      const { user, rawToken } = await seedUserWithResetToken();
      const response = await POST_RESET(
        jsonRequest("http://test.local/api/auth/reset-password", {
          token: rawToken,
          password: "NewPassword456!",
        }),
      );
      expect(response.status).toBe(200);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.passwordHash).not.toBe(user.passwordHash);
      expect(updated?.emailVerified).toBe(true);

      const credentialAccount = await prisma.authAccount.findFirst({
        where: { userId: user.id, providerId: "credential" },
      });
      expect(credentialAccount?.password).toBe(updated?.passwordHash);

      const tokenAfter = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
      });
      expect(tokenAfter?.usedAt).not.toBeNull();
    });

    it("returns 410 and leaves the password unchanged when the token has expired", async () => {
      const { user, rawToken } = await seedUserWithResetToken({ expiresInMs: -1000 });
      const before = (await prisma.user.findUnique({ where: { id: user.id } }))!.passwordHash;
      const response = await POST_RESET(
        jsonRequest("http://test.local/api/auth/reset-password", {
          token: rawToken,
          password: "NewPassword456!",
        }),
      );
      expect(response.status).toBe(410);
      const after = (await prisma.user.findUnique({ where: { id: user.id } }))!.passwordHash;
      expect(after).toBe(before);
    });

    it("returns 410 when the token has already been used (one-time-use)", async () => {
      const { rawToken } = await seedUserWithResetToken({ usedAt: now() });
      const response = await POST_RESET(
        jsonRequest("http://test.local/api/auth/reset-password", {
          token: rawToken,
          password: "NewPassword456!",
        }),
      );
      expect(response.status).toBe(410);
    });

    it("returns 404 for an unknown token", async () => {
      const response = await POST_RESET(
        jsonRequest("http://test.local/api/auth/reset-password", {
          token: "z".repeat(40),
          password: "NewPassword456!",
        }),
      );
      expect(response.status).toBe(404);
    });
  });
});
