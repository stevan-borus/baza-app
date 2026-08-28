/**
 * End-to-end notification dispatch — exercises the real
 * @/lib/server/notifications module by stubbing the Expo HTTP endpoint.
 *
 * Asserts that:
 *  - active push tokens drive the request body
 *  - title/body come from the user's preferred locale
 *  - payload includes messageKey + caller-supplied fields
 *  - dedupeKey prevents duplicate NotificationLog rows
 *  - pushEnabled=false skips dispatch but still records in-app history
 *  - tokens with isActive=false are not included in the dispatch
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

import {
  createSystemNotification,
  createAndDispatchUserNotification,
} from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
};

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: ExpoPushMessage[];
};

let captured: CapturedRequest[] = [];
const originalFetch = globalThis.fetch;

function installFetchStub(opts?: { okPerToken?: boolean }) {
  const okPerToken = opts?.okPerToken ?? true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.startsWith("https://exp.host/")) {
      // Pass through anything that isn't Expo (currently nothing else hits
      // fetch from this code path, but keep the door open).
      return originalFetch(input, init);
    }
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const headerInit = init.headers;
      if (Array.isArray(headerInit)) {
        for (const [k, v] of headerInit) headers[k] = v;
      } else if (headerInit instanceof Headers) {
        headerInit.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, headerInit as Record<string, string>);
      }
    }
    const body = init?.body ? JSON.parse(init.body as string) : [];
    captured.push({ url, method: init?.method ?? "GET", headers, body });
    const data = (body as ExpoPushMessage[]).map(() => ({
      status: okPerToken ? "ok" : "error",
    }));
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function makeUser(
  email: string,
  opts?: { pushEnabled?: boolean; preferredLocale?: "sr" | "en" },
) {
  const user = await prisma.user.create({
    data: { email, firstName: email, lastName: "Test", role: "CLIENT" },
  });
  if (opts) {
    await prisma.notificationPreference.create({
      data: {
        userId: user.id,
        pushEnabled: opts.pushEnabled ?? true,
        inAppEnabled: true,
        preferredLocale: opts.preferredLocale ?? null,
      },
    });
  }
  return user;
}

async function registerToken(userId: string, opts?: { isActive?: boolean; deviceId?: string }) {
  return prisma.pushToken.create({
    data: {
      userId,
      deviceId: opts?.deviceId ?? "device-1",
      expoPushToken: `ExpoPushToken[${opts?.deviceId ?? "device-1"}]`,
      isActive: opts?.isActive ?? true,
    },
  });
}

describe("notifications dispatch — real module + stubbed Expo HTTP", () => {
  beforeEach(async () => {
    await resetDb();
    captured = [];
    installFetchStub();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("dispatches one Expo POST with the active push token, expected headers, and the payload shape", async () => {
    const user = await makeUser("dispatch@test.local");
    await registerToken(user.id);

    const log = await createAndDispatchUserNotification({
      userId: user.id,
      type: "BOOKING_CONFIRMED",
      title: "Booked",
      body: "See you on Monday.",
      payload: { sessionId: "abc-123", state: "BOOKED" },
    });

    expect(captured).toHaveLength(1);
    const [req] = captured;
    expect(req.url).toBe(EXPO_PUSH_URL);
    expect(req.method).toBe("POST");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toHaveLength(1);
    expect(req.body[0]).toMatchObject({
      to: "ExpoPushToken[device-1]",
      title: "Booked",
      body: "See you on Monday.",
      data: { sessionId: "abc-123", state: "BOOKED" },
      sound: "default",
    });
    expect(log.pushSent).toBe(true);
    expect(log.pushStatus).toBe("DELIVERED");
  });

  it("includes the recipient's unread notification count as the badge field", async () => {
    const user = await makeUser("badge@test.local");
    await registerToken(user.id);

    // Two pre-existing unread rows so the new push should arrive with
    // badge=3 (those 2 plus the one being dispatched).
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: "GENERAL",
        title: "old 1",
        body: "",
      },
    });
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: "GENERAL",
        title: "old 2",
        body: "",
      },
    });

    await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "new",
      body: "",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].body[0].badge).toBe(3);
  });

  it("badge ignores notifications that are already read", async () => {
    const user = await makeUser("badge-read@test.local");
    await registerToken(user.id);

    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: "GENERAL",
        title: "already read",
        body: "",
        readAt: new Date(),
      },
    });

    await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "new",
      body: "",
    });

    // 0 read rows + 1 new = badge of 1.
    expect(captured[0].body[0].badge).toBe(1);
  });

  it("includes only active push tokens — deactivated devices are skipped", async () => {
    const user = await makeUser("active-only@test.local");
    await registerToken(user.id, { deviceId: "active-1", isActive: true });
    await registerToken(user.id, { deviceId: "stale-1", isActive: false });

    await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "x",
      body: "y",
    });
    expect(captured).toHaveLength(1);
    const tos = captured[0].body.map((m) => m.to);
    expect(tos).toEqual(["ExpoPushToken[active-1]"]);
  });

  it("createSystemNotification renders title/body in the user's preferred locale", async () => {
    const user = await makeUser("en@test.local", { preferredLocale: "en" });
    await registerToken(user.id);

    await createSystemNotification(
      user.id,
      "BOOKING_CONFIRMED",
      "BOOKING_CONFIRMED",
      { sessionId: "x" },
    );

    expect(captured).toHaveLength(1);
    const [{ body }] = captured;
    // The English booking-confirmed copy is "Booking confirmed" / "Your spot is locked in.".
    // Don't pin the exact string here — pin the *not-Serbian* invariant via
    // the absence of any Cyrillic and the messageKey echo in data.
    expect(body[0].title).toMatch(/^[\x20-\x7e]+$/);
    expect(body[0].data).toEqual(
      expect.objectContaining({
        sessionId: "x",
        messageKey: expect.stringContaining("booking_confirmed"),
      }),
    );
  });

  it("dedupeKey makes a second call return the same NotificationLog and skip a duplicate Expo dispatch", async () => {
    const user = await makeUser("dedupe@test.local");
    await registerToken(user.id);

    const first = await createSystemNotification(
      user.id,
      "SESSION_REMINDER",
      "GENERAL",
      { sessionId: "s-1" },
      { dedupeKey: "session-reminder:s-1:user:2026-07-15" },
    );
    const second = await createSystemNotification(
      user.id,
      "SESSION_REMINDER",
      "GENERAL",
      { sessionId: "s-1" },
      { dedupeKey: "session-reminder:s-1:user:2026-07-15" },
    );

    expect(first.id).toBe(second.id);
    const logs = await prisma.notificationLog.findMany({
      where: { userId: user.id },
    });
    expect(logs).toHaveLength(1);
    // Only the first call dispatched.
    expect(captured).toHaveLength(1);
  });

  it("pushEnabled=false records the in-app log but does not call Expo", async () => {
    const user = await makeUser("muted@test.local", { pushEnabled: false });
    await registerToken(user.id);

    const log = await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "muted",
      body: "still in-app",
    });

    const persisted = await prisma.notificationLog.findUnique({
      where: { id: log.id },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.title).toBe("muted");
    expect(captured).toHaveLength(0);
  });

  it("user with no active push tokens still records in-app and marks pushStatus accordingly", async () => {
    const user = await makeUser("notoken@test.local");
    // No token registered — skip directly to dispatch.
    const log = await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "in-app only",
      body: "no tokens",
    });
    expect(captured).toHaveLength(0);
    const persisted = await prisma.notificationLog.findUnique({
      where: { id: log.id },
    });
    expect(persisted?.pushSent).toBe(false);
    expect(persisted?.pushStatus).toBe("NO_ACTIVE_PUSH_TOKENS");
  });

  it("resolves (never rejects) when the log row vanishes before the post-dispatch update", async () => {
    // Regression: the post-dispatch notificationLog.update hits P2025 when the
    // row was deleted mid-flight (concurrent reset / cleanup). Because callers
    // fire this `void` (fire-and-forget), a rejection here surfaces as an
    // UNHANDLED rejection and crashes the server process — which is exactly what
    // took down the e2e dev server. Dispatch is best-effort: it must swallow the
    // missing-row error and resolve, not throw.
    const user = await makeUser("vanish@test.local");
    await registerToken(user.id);

    // The Expo stub deletes the just-created log row while the push is "in
    // flight", so the update that follows targets a row that no longer exists.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://exp.host/")) {
        await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return originalFetch(input);
    }) as typeof fetch;

    // Must not reject.
    await expect(
      createAndDispatchUserNotification({
        userId: user.id,
        type: "GENERAL",
        title: "vanishing",
        body: "row deleted mid-dispatch",
      }),
    ).resolves.not.toThrow();
  });
});

/**
 * Per-token delivery accounting.
 *
 * Two bugs this locks down:
 *  1. `sent` was `tickets.some(t => t.status === "ok")`, so a mixed batch
 *     (one live device, one dead) recorded a flat DELIVERED even though a
 *     device got nothing.
 *  2. Per-ticket `details.error` was never read, so a token Expo reports as
 *     DeviceNotRegistered stayed isActive forever and was retried on every
 *     future notification.
 */
describe("per-token delivery accounting + dead-token deactivation", () => {
  beforeEach(async () => {
    await resetDb();
    captured = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Expo replies with one ticket per message, in request order. */
  function installTicketStub(
    ticketsFor: (messages: ExpoPushMessage[]) => Array<Record<string, unknown>>,
  ) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.startsWith("https://exp.host/")) return originalFetch(input, init);
      const body = init?.body ? (JSON.parse(init.body as string) as ExpoPushMessage[]) : [];
      captured.push({ url, method: init?.method ?? "GET", headers: {}, body });
      return new Response(JSON.stringify({ data: ticketsFor(body) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("deactivates a token Expo reports as DeviceNotRegistered", async () => {
    const user = await makeUser("dead-token@test.local");
    await registerToken(user.id, { deviceId: "dead-1" });

    installTicketStub(() => [
      { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
    ]);

    await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "x",
      body: "y",
    });

    const token = await prisma.pushToken.findUnique({
      where: { expoPushToken: "ExpoPushToken[dead-1]" },
    });
    expect(token?.isActive).toBe(false);
  });

  it("keeps a healthy token active and only deactivates the dead one in a mixed batch", async () => {
    const user = await makeUser("mixed@test.local");
    await registerToken(user.id, { deviceId: "live-1" });
    await registerToken(user.id, { deviceId: "dead-1" });

    installTicketStub((messages) =>
      messages.map((m) =>
        m.to === "ExpoPushToken[dead-1]"
          ? { status: "error", details: { error: "DeviceNotRegistered" } }
          : { status: "ok", id: "ticket-1" },
      ),
    );

    const log = await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "x",
      body: "y",
    });

    const live = await prisma.pushToken.findUnique({
      where: { expoPushToken: "ExpoPushToken[live-1]" },
    });
    const dead = await prisma.pushToken.findUnique({
      where: { expoPushToken: "ExpoPushToken[dead-1]" },
    });
    expect(live?.isActive).toBe(true);
    expect(dead?.isActive).toBe(false);

    // A partial delivery must not read as a clean DELIVERED.
    const persisted = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(persisted?.pushSent).toBe(true);
    expect(persisted?.pushStatus).not.toBe("DELIVERED");
    expect(persisted?.pushStatus).toMatch(/1\/2|PARTIAL/i);
  });

  it("records the concrete Expo error reason rather than an opaque FAILED", async () => {
    const user = await makeUser("reason@test.local");
    await registerToken(user.id, { deviceId: "bad-creds" });

    installTicketStub(() => [
      { status: "error", details: { error: "MismatchSenderId" } },
    ]);

    const log = await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "x",
      body: "y",
    });

    const persisted = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(persisted?.pushSent).toBe(false);
    expect(persisted?.pushStatus).toContain("MismatchSenderId");
  });

  it("does not deactivate a token for a non-DeviceNotRegistered error", async () => {
    const user = await makeUser("transient@test.local");
    await registerToken(user.id, { deviceId: "transient-1" });

    installTicketStub(() => [
      { status: "error", details: { error: "MessageRateExceeded" } },
    ]);

    await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "x",
      body: "y",
    });

    const token = await prisma.pushToken.findUnique({
      where: { expoPushToken: "ExpoPushToken[transient-1]" },
    });
    // Rate limiting is transient — the device is still real.
    expect(token?.isActive).toBe(true);
  });

  it("marks an all-ok batch DELIVERED", async () => {
    const user = await makeUser("all-ok@test.local");
    await registerToken(user.id, { deviceId: "ok-1" });
    await registerToken(user.id, { deviceId: "ok-2" });

    installTicketStub((messages) => messages.map(() => ({ status: "ok", id: "t" })));

    const log = await createAndDispatchUserNotification({
      userId: user.id,
      type: "GENERAL",
      title: "x",
      body: "y",
    });

    const persisted = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(persisted?.pushSent).toBe(true);
    expect(persisted?.pushStatus).toBe("DELIVERED");
  });
});
