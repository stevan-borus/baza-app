import { describe, expect, it } from "vitest";
import { getNotificationMessage } from "@baza/i18n";

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
});
