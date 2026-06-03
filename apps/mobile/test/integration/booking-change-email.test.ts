import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

type SentEmail = { to: string; subject: string; heading: string; lines: string[] };
const sendSpy = vi.fn(async (_params: SentEmail) => undefined);
vi.mock("@/lib/server/resend", () => ({
  sendBookingChangeEmail: (params: SentEmail) => sendSpy(params),
}));

import { sendBookingChangeEmailIfEnabled } from "@/lib/server/booking-emails";
import { prisma } from "@/lib/server/prisma";

async function seedClient(opts?: { bookingEmailsEnabled?: boolean; preferredLocale?: "sr" | "en" }) {
  const user = await prisma.user.create({
    data: { email: "mara@test.local", firstName: "Mara", lastName: "K", role: "CLIENT" },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: user.id,
      bookingEmailsEnabled: opts?.bookingEmailsEnabled ?? true,
      preferredLocale: opts?.preferredLocale ?? null,
    },
  });
  return user;
}

describe("sendBookingChangeEmailIfEnabled", () => {
  beforeEach(async () => {
    await resetDb();
    sendSpy.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("sends a localized email when bookingEmailsEnabled is true (default sr)", async () => {
    const user = await seedClient();
    await sendBookingChangeEmailIfEnabled({
      userId: user.id,
      kind: "ADMIN_CANCEL",
      vars: { clientFullName: "Mara K", count: 1 },
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.to).toBe("mara@test.local");
    expect(arg.subject).toBe("Vaša rezervacija je otkazana");
    // Client-voiced body (second person), not the admin third-person copy.
    expect(arg.lines.join(" ")).toContain("Tvoj termin je otkazan");
  });

  it("uses English subject when preferredLocale is en", async () => {
    const user = await seedClient({ preferredLocale: "en" });
    await sendBookingChangeEmailIfEnabled({ userId: user.id, kind: "SESSION_UPDATED", vars: {} });
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.subject).toBe("Your session was updated");
  });

  it("interpolates the booking count into the BULK_CANCEL body", async () => {
    const user = await seedClient();
    await sendBookingChangeEmailIfEnabled({
      userId: user.id,
      kind: "BULK_CANCEL",
      vars: { count: 3 },
    });
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.lines.join(" ")).toContain("3");
  });

  it("sends by default when the client has NO preference row (column default true)", async () => {
    // A client with no NotificationPreference row should still receive the email.
    const user = await prisma.user.create({
      data: { email: "noprefs@test.local", firstName: "No", lastName: "Prefs", role: "CLIENT" },
    });
    await sendBookingChangeEmailIfEnabled({ userId: user.id, kind: "ADMIN_CANCEL", vars: {} });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe("noprefs@test.local");
  });

  it("does NOT send when bookingEmailsEnabled is false", async () => {
    const user = await seedClient({ bookingEmailsEnabled: false });
    await sendBookingChangeEmailIfEnabled({ userId: user.id, kind: "WAITLIST_PROMOTED", vars: {} });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
