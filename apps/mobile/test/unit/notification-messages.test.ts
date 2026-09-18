import { describe, expect, it } from "vitest";
import { getNotificationMessage, serbianSessionsLabel } from "@baza/i18n";

describe("getNotificationMessage — interpolation", () => {
  it("substitutes {{clientFullName}} into BIRTHDAY_ADMIN_PROMPT body only (title stays generic)", () => {
    const { title, body } = getNotificationMessage(
      "BIRTHDAY_ADMIN_PROMPT",
      "sr",
      { clientFullName: "Marko Marković" },
    );
    // Title stays generic to avoid repeating the name twice in the row.
    expect(title).not.toContain("Marko Marković");
    expect(title).toContain("Rođendan");
    expect(body).toContain("Marko Marković");
    expect(body).not.toContain("{{");
  });

  it("substitutes {{clientFullName}} in English body too", () => {
    const { title, body } = getNotificationMessage(
      "BIRTHDAY_ADMIN_PROMPT",
      "en",
      { clientFullName: "Marko Marković" },
    );
    expect(title).not.toContain("Marko Marković");
    expect(body).toContain("Marko Marković");
  });

  it("leaves messages without placeholders unchanged when no vars are passed", () => {
    const { title } = getNotificationMessage("BOOKING_CONFIRMED", "sr");
    expect(title).toBe("Rezervacija potvrđena");
  });

  it("returns the template as-is when a placeholder has no matching var (defensive)", () => {
    // Caller might forget to pass clientFullName — we want a readable fallback,
    // not "undefined" or a thrown error. Leaving the placeholder in is fine —
    // the inbox-level payloadInterpolation can still substitute, and the worst
    // case is the literal "{{clientFullName}}" appears (visible bug, not silent).
    const { body } = getNotificationMessage("BIRTHDAY_ADMIN_PROMPT", "sr");
    expect(body).toContain("{{clientFullName}}");
  });

  it("PACKAGE_REVOKED is neutral, static copy in both locales (no reason, no placeholders)", () => {
    // The studio owns the conversation about WHY — the notification stays
    // neutral and static so it never leaks a reason or an unfilled {{var}}.
    const sr = getNotificationMessage("PACKAGE_REVOKED", "sr");
    expect(sr.title).toBe("Paket je opozvan");
    expect(sr.body).toBe(
      "Vaš paket je opozvan i budući termini su otkazani. Za više informacija javite nam se.",
    );
    expect(sr.body).not.toContain("{{");

    const en = getNotificationMessage("PACKAGE_REVOKED", "en");
    expect(en.title).toBe("Package revoked");
    expect(en.body).toBe(
      "Your package has been revoked and your upcoming sessions were canceled. Contact us for more information.",
    );
    expect(en.body).not.toContain("{{");
  });
});

/**
 * Guards the drift that let 7 message keys ship with no locale entry at all:
 * those notifications silently fell back to the DB-stored string, so the
 * inbox showed server copy that never followed the user's language.
 *
 * Scoped to the keys that are actually rendered through the app inbox — the
 * pre-existing gap is tracked separately and is not this test's job to fix.
 */
describe("notification message keys have app locale entries", () => {
  it("TRAINER_DAILY_SCHEDULE resolves in both locales without leaking placeholders", () => {
    for (const locale of ["sr", "en"] as const) {
      const { title, body } = getNotificationMessage(
        "TRAINER_DAILY_SCHEDULE",
        locale,
        { count: 3, firstStartsAt: "07:30" },
      );
      expect(title.length).toBeGreaterThan(0);
      expect(body).toContain("3");
      expect(body).toContain("07:30");
      expect(body).not.toContain("{{");
    }
  });

  it("TRAINER_DAILY_SCHEDULE has an entry in both app locale files", async () => {
    const [sr, en] = await Promise.all([
      import("@/locales/sr.json"),
      import("@/locales/en.json"),
    ]);
    for (const bundle of [sr.default, en.default] as Array<
      Record<string, Record<string, { title?: string; body?: string }>>
    >) {
      const entry = bundle.notification?.trainer_daily_schedule;
      expect(entry?.title).toBeTruthy();
      expect(entry?.body).toBeTruthy();
    }
  });
});

/**
 * Generic gift copy. Every gifted package used to send birthday copy, so a
 * graduation or apology gift wished the client a happy birthday. GIFT_PACKAGE
 * is the default now; the birthday wording survives only for an assignment
 * that actually came from the birthday prompt.
 *
 * Serbian needs three plural forms for "termin" (1 / 2–4 / 5+), so the count
 * word rides in as {{sessionsLabel}} rather than being glued to {{count}}.
 */
describe("GIFT_PACKAGE copy", () => {
  it("uses the singular Serbian form for one session", () => {
    const { title, body } = getNotificationMessage("GIFT_PACKAGE", "sr", {
      sessionsGranted: 1,
      packageTypeName: "Reformer 12",
    });
    expect(title).toBe("🎁 Poklon za tebe");
    expect(body).toBe('Poklanjamo ti 1 termin iz paketa "Reformer 12".');
    expect(body).not.toContain("{{");
  });

  it("uses the 2–4 Serbian form for three sessions", () => {
    const { body } = getNotificationMessage("GIFT_PACKAGE", "sr", {
      sessionsGranted: 3,
      packageTypeName: "Reformer 12",
    });
    expect(body).toBe('Poklanjamo ti 3 termina iz paketa "Reformer 12".');
  });

  it("uses the 5+ Serbian form for five sessions", () => {
    const { body } = getNotificationMessage("GIFT_PACKAGE", "sr", {
      sessionsGranted: 5,
      packageTypeName: "Reformer 12",
    });
    expect(body).toBe('Poklanjamo ti 5 termina iz paketa "Reformer 12".');
  });

  it("renders English singular and plural", () => {
    const one = getNotificationMessage("GIFT_PACKAGE", "en", {
      sessionsGranted: 1,
      packageTypeName: "Reformer 12",
    });
    expect(one.title).toBe("🎁 A gift for you");
    expect(one.body).toBe('We\'re gifting you 1 session from the "Reformer 12" package.');
    const three = getNotificationMessage("GIFT_PACKAGE", "en", {
      sessionsGranted: 3,
      packageTypeName: "Reformer 12",
    });
    expect(three.body).toBe(
      'We\'re gifting you 3 sessions from the "Reformer 12" package.',
    );
  });

  it("has an entry in both app locale files", async () => {
    const [sr, en] = await Promise.all([
      import("@/locales/sr.json"),
      import("@/locales/en.json"),
    ]);
    for (const bundle of [sr.default, en.default] as Array<
      Record<string, Record<string, { title?: string; body?: string }>>
    >) {
      const entry = bundle.notification?.gift_package;
      expect(entry?.title).toBeTruthy();
      expect(entry?.body).toBeTruthy();
    }
  });
});

describe("serbianSessionsLabel", () => {
  it("picks the right form across the Serbian plural boundaries", () => {
    const cases: Array<[number, string]> = [
      [1, "termin"],
      [2, "termina"],
      [4, "termina"],
      [5, "termina"],
      [11, "termina"],
      [21, "termin"],
      [22, "termina"],
      [25, "termina"],
    ];
    for (const [count, expected] of cases) {
      expect(serbianSessionsLabel(count)).toBe(expected);
    }
  });
});
