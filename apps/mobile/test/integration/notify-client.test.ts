import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

type SentEmail = { to: string; subject: string; heading: string; lines: string[]; footer: string };
const sendSpy = vi.fn(async (_params: SentEmail) => undefined);
vi.mock("@/lib/server/resend", () => ({
  sendBookingChangeEmail: (params: SentEmail) => sendSpy(params),
}));

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
});
