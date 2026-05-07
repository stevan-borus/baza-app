import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";
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

// Stub out push dispatch so the route just records to the DB.
vi.mock("@/lib/server/notifications", async () => {
  const { prisma } = await import("@/lib/server/prisma");
  const { Prisma } = await import("@/generated/prisma");
  type StubNotificationInput = {
    userId: string;
    type: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  };
  return {
    getPreferredLocale: async () => "en",
    createSystemNotification: vi.fn(async () => undefined),
    createAndDispatchUserNotification: vi.fn(
      async (input: StubNotificationInput) =>
        prisma.notificationLog.create({
          data: {
            userId: input.userId,
            type: input.type as never,
            title: input.title,
            body: input.body,
            payload:
              input.payload === undefined
                ? Prisma.JsonNull
                : (JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue),
          },
        }),
    ),
  };
});

import { GET, POST } from "@/app/api/notifications/+api";
import { PATCH } from "@/app/api/notifications/[id]/+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

async function makeUser(opts: { email: string; role?: "ADMIN" | "CLIENT" | "TRAINER" }) {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      fullName: opts.email,
      role: opts.role ?? "CLIENT",
    },
  });
  return user;
}

function authAs(user: { id: string; role: string; email: string }) {
  setMockUser({
    id: user.id,
    role: user.role as never,
    email: user.email,
    isActive: true,
    clientProfile: user.role === "CLIENT" ? { id: "p" } : null,
  });
}

describe("notifications API", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET returns the caller's notifications in newest-first order", async () => {
    const me = await makeUser({ email: "me@test.local" });
    await prisma.notificationLog.create({
      data: {
        userId: me.id,
        type: "GENERAL",
        title: "old",
        body: "old",
        payload: {},
        createdAt: new Date(nowMs() - 60_000),
      },
    });
    await prisma.notificationLog.create({
      data: {
        userId: me.id,
        type: "GENERAL",
        title: "new",
        body: "new",
        payload: {},
        // Pin createdAt explicitly so this asserts the order regardless of
        // DB-side `now()` vs. anchored app-side `now()`.
        createdAt: now(),
      },
    });
    authAs(me);

    const response = await GET(
      new Request("http://test.local/api/notifications?take=10"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { notifications: { title: string }[] };
    expect(body.notifications.map((n) => n.title)).toEqual(["new", "old"]);
  });

  it("GET does not leak other users' notifications", async () => {
    const me = await makeUser({ email: "me2@test.local" });
    const other = await makeUser({ email: "other@test.local" });
    await prisma.notificationLog.create({
      data: { userId: me.id, type: "GENERAL", title: "mine", body: "b", payload: {} },
    });
    await prisma.notificationLog.create({
      data: {
        userId: other.id,
        type: "GENERAL",
        title: "theirs",
        body: "b",
        payload: {},
      },
    });
    authAs(me);
    const response = await GET(
      new Request("http://test.local/api/notifications?take=10"),
    );
    const body = (await response.json()) as { notifications: { title: string }[] };
    expect(body.notifications.map((n) => n.title)).toEqual(["mine"]);
  });

  it("PATCH /:id marks the caller's notification as read", async () => {
    const me = await makeUser({ email: "me3@test.local" });
    const notif = await prisma.notificationLog.create({
      data: {
        userId: me.id,
        type: "GENERAL",
        title: "t",
        body: "b",
        payload: {},
      },
    });
    authAs(me);

    const response = await PATCH(
      new Request(`http://test.local/api/notifications/${notif.id}`, {
        method: "PATCH",
      }),
      { id: notif.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.notificationLog.findUnique({
      where: { id: notif.id },
    });
    expect(reloaded?.readAt).not.toBeNull();
  });

  it("PATCH /:id is idempotent — calling it twice does not change readAt to a later timestamp", async () => {
    const me = await makeUser({ email: "me4@test.local" });
    const notif = await prisma.notificationLog.create({
      data: {
        userId: me.id,
        type: "GENERAL",
        title: "t",
        body: "b",
        payload: {},
      },
    });
    authAs(me);

    await PATCH(
      new Request(`http://test.local/api/notifications/${notif.id}`, { method: "PATCH" }),
      { id: notif.id },
    );
    const firstReadAt = (await prisma.notificationLog.findUnique({
      where: { id: notif.id },
    }))!.readAt!;

    // tiny delay so a re-set would show a different timestamp
    await new Promise((r) => setTimeout(r, 10));

    await PATCH(
      new Request(`http://test.local/api/notifications/${notif.id}`, { method: "PATCH" }),
      { id: notif.id },
    );
    const secondReadAt = (await prisma.notificationLog.findUnique({
      where: { id: notif.id },
    }))!.readAt!;

    expect(secondReadAt.getTime()).toBe(firstReadAt.getTime());
  });

  it("PATCH /:id returns 404 when the notification belongs to a different user", async () => {
    const me = await makeUser({ email: "me5@test.local" });
    const other = await makeUser({ email: "other2@test.local" });
    const theirNotif = await prisma.notificationLog.create({
      data: {
        userId: other.id,
        type: "GENERAL",
        title: "t",
        body: "b",
        payload: {},
      },
    });
    authAs(me);
    const response = await PATCH(
      new Request(`http://test.local/api/notifications/${theirNotif.id}`, {
        method: "PATCH",
      }),
      { id: theirNotif.id },
    );
    expect(response.status).toBe(404);
    const reloaded = await prisma.notificationLog.findUnique({
      where: { id: theirNotif.id },
    });
    expect(reloaded?.readAt).toBeNull();
  });

  it("POST as admin records a new notification for an active target user", async () => {
    const admin = await makeUser({ email: "a@test.local", role: "ADMIN" });
    const target = await makeUser({ email: "t@test.local" });
    authAs(admin);

    const response = await POST(
      new Request("http://test.local/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: target.id,
          type: "GENERAL",
          title: "Hi",
          body: "There",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.notificationLog.findFirst({
      where: { userId: target.id },
    });
    expect(persisted?.title).toBe("Hi");
  });

  it("POST returns 404 when the target user is deactivated", async () => {
    const admin = await makeUser({ email: "a2@test.local", role: "ADMIN" });
    const inactive = await makeUser({ email: "off@test.local" });
    await prisma.user.update({
      where: { id: inactive.id },
      data: { isActive: false },
    });
    authAs(admin);

    const response = await POST(
      new Request("http://test.local/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: inactive.id,
          type: "GENERAL",
          title: "x",
          body: "x",
        }),
      }),
    );
    expect(response.status).toBe(404);
    const persisted = await prisma.notificationLog.findFirst({
      where: { userId: inactive.id },
    });
    expect(persisted).toBeNull();
  });
});
