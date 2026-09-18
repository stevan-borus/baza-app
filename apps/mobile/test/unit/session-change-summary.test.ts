import { describe, expect, it } from "vitest";
import { getNotificationMessage, getBookingEmailContent } from "@baza/i18n";
import { describeSessionChanges } from "@/lib/server/session-change-summary";

const before = {
  startsAt: new Date("2026-09-16T04:30:00Z"), // 06:30 Belgrade
  roomName: "Sala 1",
  trainerFullName: "Ana Anić",
  capacity: 6,
};

describe("describeSessionChanges", () => {
  it("reports a moved start as a reschedule and carries the old and the new time", () => {
    const result = describeSessionChanges(before, {
      ...before,
      startsAt: new Date("2026-09-16T05:00:00Z"), // 07:00 Belgrade
    });
    expect(result.rescheduled).toBe(true);
    expect(result.vars.sessionWhen).toEqual({ sr: "16.09. u 07:00", en: "16 Sep at 07:00" });
    expect(result.vars.oldSessionWhen).toEqual({ sr: "16.09. u 06:30", en: "16 Sep at 06:30" });
  });

  it("reports a room-only change as a details update, not a reschedule", () => {
    const result = describeSessionChanges(before, { ...before, roomName: "Sala 2" });
    expect(result.rescheduled).toBe(false);
    expect(result.vars.roomName).toEqual({ sr: "Sala 2", en: "Sala 2" });
  });

  it("reports a trainer-only change as a details update carrying the new trainer", () => {
    const result = describeSessionChanges(before, { ...before, trainerFullName: "Mila Milić" });
    expect(result.rescheduled).toBe(false);
    expect(result.vars.trainerFullName).toEqual({ sr: "Mila Milić", en: "Mila Milić" });
  });

  it("omits capacity from the client-facing summary — a capacity-only change is not a reschedule", () => {
    const result = describeSessionChanges(before, { ...before, capacity: 8 });
    expect(result.rescheduled).toBe(false);
    expect(JSON.stringify(result.vars)).not.toContain("8");
  });

  it("falls back to a dash when the room or trainer is unset, never an empty placeholder", () => {
    const result = describeSessionChanges(
      { ...before, roomName: null, trainerFullName: null },
      { ...before, roomName: null, trainerFullName: null, startsAt: new Date("2026-09-16T05:00:00Z") },
    );
    expect(result.vars.roomName).toEqual({ sr: "—", en: "—" });
    expect(result.vars.trainerFullName).toEqual({ sr: "—", en: "—" });
  });
});

describe("session-change vars fill the shipped copy with no leftover placeholder", () => {
  const rescheduled = describeSessionChanges(before, {
    ...before,
    startsAt: new Date("2026-09-16T05:00:00Z"),
  });
  const detailsOnly = describeSessionChanges(before, { ...before, roomName: "Sala 2" });

  const varsFor = (
    result: ReturnType<typeof describeSessionChanges>,
    locale: "sr" | "en",
  ) =>
    Object.fromEntries(
      Object.entries(result.vars).map(([k, v]) => [k, v[locale]]),
    ) as Record<string, string>;

  it("fills the SESSION_RESCHEDULED in-app body with both times in both locales", () => {
    const sr = getNotificationMessage(
      "SESSION_RESCHEDULED",
      "sr",
      { ...varsFor(rescheduled, "sr"), classTypeName: "Reformer" },
    );
    expect(sr.body).toContain("16.09. u 06:30");
    expect(sr.body).toContain("16.09. u 07:00");
    expect(sr.body).toContain("Reformer");
    expect(sr.body).not.toContain("{{");

    const en = getNotificationMessage(
      "SESSION_RESCHEDULED",
      "en",
      { ...varsFor(rescheduled, "en"), classTypeName: "Reformer" },
    );
    expect(en.body).toContain("16 Sep at 06:30");
    expect(en.body).toContain("16 Sep at 07:00");
    expect(en.body).not.toContain("{{");
  });

  it("fills the SESSION_DETAILS_UPDATED in-app body with the full new state in both locales", () => {
    for (const locale of ["sr", "en"] as const) {
      const msg = getNotificationMessage(
        "SESSION_DETAILS_UPDATED",
        locale,
        { ...varsFor(detailsOnly, locale), classTypeName: "Reformer" },
      );
      expect(msg.body).toContain("16.09. u 06:30".replace("16.09. u ", locale === "en" ? "16 Sep at " : "16.09. u "));
      expect(msg.body).toContain("Sala 2");
      expect(msg.body).toContain("Ana Anić");
      expect(msg.body).not.toContain("{{");
    }
  });

  it("fills the SESSION_UPDATED email body with the new details in both locales", () => {
    for (const locale of ["sr", "en"] as const) {
      const email = getBookingEmailContent("SESSION_UPDATED", locale, {
        ...varsFor(detailsOnly, locale),
        classTypeName: "Reformer",
      });
      expect(email.body).toContain("Reformer");
      expect(email.body).toContain("Sala 2");
      expect(email.body).not.toContain("{{");
      expect(email.subject).not.toContain("{{");
      expect(email.heading).not.toContain("{{");
    }
  });
});
