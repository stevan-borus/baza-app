import { describe, expect, it } from "vitest";
import { formatSessionWhen } from "@/lib/format-session-when";

describe("formatSessionWhen", () => {
  // 2026-09-16T04:30:00Z is 06:30 Belgrade (CEST, +02:00).
  const morning = new Date("2026-09-16T04:30:00Z");

  it("formats a Serbian date as DD.MM. u HH:mm in studio time", () => {
    expect(formatSessionWhen(morning, "sr")).toBe("16.09. u 06:30");
  });

  it("formats an English date as DD Mon at HH:mm in studio time", () => {
    expect(formatSessionWhen(morning, "en")).toBe("16 Sep at 06:30");
  });

  it("uses the Belgrade calendar day, not the UTC one, across the midnight boundary", () => {
    // 2026-09-16T23:15:00Z is already 01:15 on the 17th in Belgrade.
    const lateNight = new Date("2026-09-16T23:15:00Z");
    expect(formatSessionWhen(lateNight, "sr")).toBe("17.09. u 01:15");
    expect(formatSessionWhen(lateNight, "en")).toBe("17 Sep at 01:15");
  });

  it("uses the winter offset (CET, +01:00) outside daylight saving", () => {
    // 2026-01-15T05:30:00Z is 06:30 Belgrade in winter.
    const winter = new Date("2026-01-15T05:30:00Z");
    expect(formatSessionWhen(winter, "sr")).toBe("15.01. u 06:30");
    expect(formatSessionWhen(winter, "en")).toBe("15 Jan at 06:30");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatSessionWhen("2026-09-16T04:30:00Z", "sr")).toBe("16.09. u 06:30");
  });
});
