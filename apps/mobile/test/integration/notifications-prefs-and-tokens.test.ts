import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_PREFS, PATCH as PATCH_PREFS } from "@/server/routes/notifications/preferences";
import { POST as POST_TOKEN, DELETE as DELETE_TOKEN } from "@/server/routes/notifications/push-token";
import { prisma } from "@/lib/server/prisma";

async function makeUser(email: string) {
  const user = await prisma.user.create({
    data: { email, firstName: email, lastName: "Test", role: "CLIENT" },
  });
  setMockUser({
    id: user.id,
    role: "CLIENT",
    email: user.email,
    isActive: true,
    clientProfile: { id: "p" },
  });
  return user;
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("notifications preferences + push-token", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("preferences", () => {
    it("GET creates a default preferences row for a first-time user", async () => {
      const user = await makeUser("first@test.local");
      expect(
        await prisma.notificationPreference.findUnique({
          where: { userId: user.id },
        }),
      ).toBeNull();

      const response = await GET_PREFS(
        new Request("http://test.local/api/notifications/preferences"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        preferences: { pushEnabled: boolean; inAppEnabled: boolean; preferredLocale: string | null };
      };
      expect(body.preferences.pushEnabled).toBe(true);
      expect(body.preferences.inAppEnabled).toBe(true);
      // Persistence side effect — the row now exists.
      const persisted = await prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      expect(persisted).not.toBeNull();
    });

    it("PATCH updates only the fields explicitly provided in the payload", async () => {
      const user = await makeUser("patch@test.local");
      // Seed an explicit baseline to verify selective update.
      await prisma.notificationPreference.create({
        data: {
          userId: user.id,
          pushEnabled: true,
          inAppEnabled: true,
          preferredLocale: "sr",
        },
      });

      const response = await PATCH_PREFS(
        jsonRequest("http://test.local/api/notifications/preferences", "PATCH", {
          preferredLocale: "en",
        }),
      );
      expect(response.status).toBe(200);
      const persisted = await prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      // Only preferredLocale changed; the boolean fields stay untouched.
      expect(persisted?.preferredLocale).toBe("en");
      expect(persisted?.pushEnabled).toBe(true);
      expect(persisted?.inAppEnabled).toBe(true);
    });

    it("PATCH can disable push without affecting inAppEnabled or preferredLocale", async () => {
      const user = await makeUser("disable@test.local");
      await prisma.notificationPreference.create({
        data: {
          userId: user.id,
          pushEnabled: true,
          inAppEnabled: true,
          preferredLocale: "sr",
        },
      });

      await PATCH_PREFS(
        jsonRequest("http://test.local/api/notifications/preferences", "PATCH", {
          pushEnabled: false,
        }),
      );
      const persisted = await prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      expect(persisted?.pushEnabled).toBe(false);
      expect(persisted?.inAppEnabled).toBe(true);
      expect(persisted?.preferredLocale).toBe("sr");
    });
  });

  describe("push-token", () => {
    it("POST registers a new push token and creates the preferences row when missing", async () => {
      const user = await makeUser("reg@test.local");
      const response = await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "device-1",
          expoPushToken: "ExpoPushToken[abc]",
        }),
      );
      expect(response.status).toBe(200);
      const persistedToken = await prisma.pushToken.findUnique({
        where: {
          userId_deviceId: { userId: user.id, deviceId: "device-1" },
        },
      });
      expect(persistedToken?.expoPushToken).toBe("ExpoPushToken[abc]");
      expect(persistedToken?.isActive).toBe(true);
      const prefs = await prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      expect(prefs).not.toBeNull();
    });

    it("POST re-registering the same device updates the expoPushToken in place", async () => {
      const user = await makeUser("reup@test.local");
      await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "device-1",
          expoPushToken: "ExpoPushToken[old]",
        }),
      );
      await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "device-1",
          expoPushToken: "ExpoPushToken[new]",
        }),
      );
      const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].expoPushToken).toBe("ExpoPushToken[new]");
    });

    it("POST re-registering a token that already belongs to another device reclaims it instead of crashing", async () => {
      // Regression: SDK 56 removed Constants.installationId, so the same physical
      // device can re-register the same Expo token under a different deviceId
      // (e.g. account switch / reinstall). The expoPushToken column is globally
      // @unique, so a naive upsert keyed on (userId, deviceId) hits a unique-
      // constraint violation on expoPushToken. The handler must reclaim the token.
      const user = await makeUser("reclaim@test.local");
      await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "old-device",
          expoPushToken: "ExpoPushToken[shared]",
        }),
      );

      const response = await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "new-device",
          expoPushToken: "ExpoPushToken[shared]",
        }),
      );

      expect(response.status).toBe(200);
      // The token is owned by exactly one row, now bound to the new device.
      const tokens = await prisma.pushToken.findMany({
        where: { expoPushToken: "ExpoPushToken[shared]" },
      });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].deviceId).toBe("new-device");
      expect(tokens[0].userId).toBe(user.id);
      expect(tokens[0].isActive).toBe(true);
    });

    it("POST claiming a token registered to a different user moves it to the new owner", async () => {
      // Same physical phone, account A logs out and account B logs in. The Expo
      // token follows the device, so it must transfer to the new user.
      const userA = await makeUser("ownerA@test.local");
      await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "shared-device",
          expoPushToken: "ExpoPushToken[transfer]",
        }),
      );

      const userB = await makeUser("ownerB@test.local");
      const response = await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "shared-device",
          expoPushToken: "ExpoPushToken[transfer]",
        }),
      );

      expect(response.status).toBe(200);
      const tokens = await prisma.pushToken.findMany({
        where: { expoPushToken: "ExpoPushToken[transfer]" },
      });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].userId).toBe(userB.id);
      expect(userA.id).not.toBe(userB.id);
    });

    it("POST with preferredLocale syncs the preferences row to that locale", async () => {
      const user = await makeUser("locale@test.local");
      await POST_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "POST", {
          deviceId: "device-1",
          expoPushToken: "ExpoPushToken[abc]",
          preferredLocale: "en",
        }),
      );
      const prefs = await prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      expect(prefs?.preferredLocale).toBe("en");
    });

    it("DELETE deactivates only the matching deviceId, leaves other devices active", async () => {
      const user = await makeUser("multi@test.local");
      await prisma.pushToken.createMany({
        data: [
          {
            userId: user.id,
            deviceId: "device-1",
            expoPushToken: "t1",
            isActive: true,
          },
          {
            userId: user.id,
            deviceId: "device-2",
            expoPushToken: "t2",
            isActive: true,
          },
        ],
      });

      await DELETE_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "DELETE", {
          deviceId: "device-1",
        }),
      );

      const tokens = await prisma.pushToken.findMany({
        where: { userId: user.id },
        orderBy: { deviceId: "asc" },
      });
      expect(tokens.find((t) => t.deviceId === "device-1")?.isActive).toBe(false);
      expect(tokens.find((t) => t.deviceId === "device-2")?.isActive).toBe(true);
    });

    it("DELETE without a deviceId deactivates every token belonging to the caller", async () => {
      const user = await makeUser("all@test.local");
      await prisma.pushToken.createMany({
        data: [
          {
            userId: user.id,
            deviceId: "device-1",
            expoPushToken: "t1",
            isActive: true,
          },
          {
            userId: user.id,
            deviceId: "device-2",
            expoPushToken: "t2",
            isActive: true,
          },
        ],
      });

      const response = await DELETE_TOKEN(
        jsonRequest("http://test.local/api/notifications/push-token", "DELETE"),
      );
      expect(response.status).toBe(200);
      const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
      expect(tokens.every((t) => t.isActive === false)).toBe(true);
    });
  });
});
