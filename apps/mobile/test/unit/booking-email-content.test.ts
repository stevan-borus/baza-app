import { describe, expect, it } from "vitest";
import { getBookingEmailContent } from "@baza/i18n";

describe("ADMIN_CANCEL email names the cancelled session", () => {
  it("sr body carries the class type and the formatted start", () => {
    const { subject, heading, body } = getBookingEmailContent("ADMIN_CANCEL", "sr", {
      classTypeName: "Reformer",
      sessionWhen: "16.09. u 06:30",
    });
    expect(subject).toBe("Tvoja rezervacija je otkazana");
    expect(heading).toBe("Tvoja rezervacija je otkazana");
    expect(body).toContain("Reformer");
    expect(body).toContain("16.09. u 06:30");
    expect(body).not.toContain("{{");
  });

  it("en body carries the class type and the formatted start", () => {
    const { body } = getBookingEmailContent("ADMIN_CANCEL", "en", {
      classTypeName: "Reformer",
      sessionWhen: "16 Sep at 06:30",
    });
    expect(body).toContain("Reformer");
    expect(body).toContain("16 Sep at 06:30");
    expect(body).not.toContain("{{");
  });
});

describe("BULK_CANCEL email lists every cancelled session", () => {
  const details = ["Reformer — 16.09. u 06:30", "Mat — 17.09. u 18:00"];

  it("keeps the count in the body and returns the list as separate lines (sr)", () => {
    const content = getBookingEmailContent("BULK_CANCEL", "sr", { count: 2 }, { details });
    expect(content.body).toContain("2");
    expect(content.body).not.toContain("{{");
    expect(content.lines.slice(0, 3)).toEqual([content.body, ...details]);
    expect(content.lines.at(-1)).toBe("Ako misliš da je ovo greška, javi se studiju.");
  });

  it("keeps the count in the body and returns the list as separate lines (en)", () => {
    const content = getBookingEmailContent("BULK_CANCEL", "en", { count: 2 }, { details });
    expect(content.body).toContain("2");
    expect(content.lines.slice(0, 3)).toEqual([content.body, ...details]);
    expect(content.lines.at(-1)).toBe(
      "If you think this is a mistake, please contact the studio.",
    );
  });

  it("returns the body plus the closing line when no details are supplied", () => {
    const content = getBookingEmailContent("BULK_CANCEL", "sr", { count: 2 });
    expect(content.lines).toEqual([
      content.body,
      "Ako misliš da je ovo greška, javi se studiju.",
    ]);
  });

  it("never interpolates the details through {{}} — a newline-bearing value stays whole", () => {
    const content = getBookingEmailContent("BULK_CANCEL", "sr", { count: 1 }, {
      details: ["Reformer — 16.09. u 06:30"],
    });
    expect(content.lines[1]).toBe("Reformer — 16.09. u 06:30");
  });
});
