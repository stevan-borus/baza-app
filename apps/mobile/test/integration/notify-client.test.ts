import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

type SentEmail = { to: string; subject: string; heading: string; lines: string[]; footer: string };
const sendSpy = vi.fn(async (_params: SentEmail) => undefined);
vi.mock("@/lib/server/resend", () => ({
  sendBookingChangeEmail: (params: SentEmail) => sendSpy(params),
}));

// Partial mock: the real createSystemNotification still writes the in-app row
// to the DB; only getPreferredLocale is routed through a spy so a test can make
// the locale lookup reject. Unset, the spy delegates to the real lookup.
// vi.hoisted: the mock factory runs before module-level consts initialize, so
// the spy has to be created in the hoisted block to be visible inside it.
const { localeSpy } = vi.hoisted(() => ({
  localeSpy: vi.fn<(userId: string) => Promise<"sr" | "en">>(),
}));
vi.mock("@/lib/server/notifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/server/notifications")>();
  // Default to the real lookup so every other test in this file is unaffected;
  // only the fallback tests override it.
  localeSpy.mockImplementation(actual.getPreferredLocale);
  return { ...actual, getPreferredLocale: localeSpy };
});

import { notifyClient } from "@/lib/server/notify-client";
import { prisma } from "@/lib/server/prisma";

async function seedClient(opts?: {
  bookingEmailsEnabled?: boolean;
  pushEnabled?: boolean;
  preferredLocale?: "sr" | "en";
  email?: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: opts?.email ?? "mara@test.local",
      firstName: "Mara",
      lastName: "K",
      role: "CLIENT",
    },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: user.id,
      bookingEmailsEnabled: opts?.bookingEmailsEnabled ?? true,
      pushEnabled: opts?.pushEnabled ?? true,
      preferredLocale: opts?.preferredLocale ?? null,
    },
  });
  return user;
}

describe("notifyClient", () => {
  beforeEach(async () => {
    await resetDb();
    sendSpy.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("WAITLIST_PROMOTED writes an in-app log AND sends an email", async () => {
    const user = await seedClient();
    await notifyClient({ userId: user.id, event: "WAITLIST_PROMOTED", vars: { sessionId: "s1" } });

    const logs = await prisma.notificationLog.count({ where: { userId: user.id } });
    expect(logs).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe("mara@test.local");
  });

  it("localizes the opt-out footer to the recipient's locale (was hardcoded sr)", async () => {
    const sr = await seedClient({ email: "sr@test.local", preferredLocale: "sr" });
    await notifyClient({ userId: sr.id, event: "ADMIN_CANCEL", vars: {} });
    expect(sendSpy.mock.calls[0][0].footer).toContain("podešavanjima obaveštenja");

    sendSpy.mockClear();
    const en = await seedClient({ email: "en@test.local", preferredLocale: "en" });
    await notifyClient({ userId: en.id, event: "ADMIN_CANCEL", vars: {} });
    const footer = sendSpy.mock.calls[0][0].footer;
    expect(footer).toContain("notification settings");
    expect(footer).not.toContain("podešavanjima");
  });

  it("suppresses ONLY the email when bookingEmailsEnabled=false; in-app still fires", async () => {
    const user = await seedClient({ bookingEmailsEnabled: false });
    await notifyClient({ userId: user.id, event: "WAITLIST_PROMOTED", vars: {} });

    const logs = await prisma.notificationLog.count({ where: { userId: user.id } });
    expect(logs).toBe(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("BULK_CANCEL is email-only — no in-app log written", async () => {
    const user = await seedClient();
    await notifyClient({ userId: user.id, event: "BULK_CANCEL", vars: { count: 3 } });

    const logs = await prisma.notificationLog.count({ where: { userId: user.id } });
    expect(logs).toBe(0);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].lines.join(" ")).toContain("3");
  });

  it("ADMIN_CANCEL sends the singular cancel copy (email-only)", async () => {
    const user = await seedClient();
    await notifyClient({ userId: user.id, event: "ADMIN_CANCEL", vars: {} });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].subject).toBe("Tvoja rezervacija je otkazana");
    const logs = await prisma.notificationLog.count({ where: { userId: user.id } });
    expect(logs).toBe(0);
  });

  it("accepts a pre-fetched recipient and does not re-query the user for email", async () => {
    const user = await seedClient({ email: "prefetch@test.local" });
    const spy = vi.spyOn(prisma.user, "findUnique");
    await notifyClient({
      userId: user.id,
      event: "BULK_CANCEL",
      vars: { count: 2 },
      recipient: {
        email: "prefetch@test.local",
        bookingEmailsEnabled: true,
        preferredLocale: null,
      },
    });
    // No user.findUnique for the email/pref lookup (in-app side may still query,
    // but BULK_CANCEL is email-only so nothing should hit user.findUnique here).
    expect(spy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe("prefetch@test.local");
    spy.mockRestore();
  });

  it("does not reject when the email send throws (fire-and-forget safety)", async () => {
    const user = await seedClient();
    sendSpy.mockRejectedValueOnce(new Error("render boom"));
    // Must resolve, not throw — call sites use `void notifyClient(...)`.
    await expect(
      notifyClient({ userId: user.id, event: "ADMIN_CANCEL", vars: {} }),
    ).resolves.toBeUndefined();
  });

  it("does not reject — and still emails — when the locale lookup throws", async () => {
    const user = await seedClient();
    localeSpy.mockRejectedValueOnce(new Error("locale boom"));

    // WAITLIST_PROMOTED fans out to both channels, so a throw on the in-app
    // side must neither escape nor skip the email.
    await expect(
      notifyClient({ userId: user.id, event: "WAITLIST_PROMOTED", vars: {} }),
    ).resolves.toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe("mara@test.local");
  });

  it("falls back to the sr default for localizedVars when the lookup throws", async () => {
    const user = await seedClient({ preferredLocale: "en" });
    localeSpy.mockRejectedValueOnce(new Error("locale boom"));
    const localizedVars = vi.fn((locale: "sr" | "en") => ({ locale }));

    await notifyClient({
      userId: user.id,
      event: "PACKAGE_ASSIGNED",
      vars: {},
      localizedVars,
    });

    expect(localizedVars).toHaveBeenCalledWith("sr");
    // The in-app row is still written — a failed locale lookup degrades the
    // copy, it does not drop the notification.
    const logs = await prisma.notificationLog.count({
      where: { userId: user.id },
    });
    expect(logs).toBe(1);
  });
});
