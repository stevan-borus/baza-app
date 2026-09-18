/**
 * Unit: deriveClientPackageStatus — the per-client package chip shown in the
 * Klijenti list. Priority is paused > active > expiring > expired > none.
 */
import { describe, expect, it } from "vitest";
import { deriveClientPackageStatus } from "@/lib/server/client-package-status";

const at = new Date("2026-06-01T10:00:00.000Z");
const expiringThreshold = new Date("2026-06-15T10:00:00.000Z");

function run(
  packages: { sessionsRemaining: number; expiresAt: Date }[],
  hasActivePause = false,
) {
  return deriveClientPackageStatus({
    packages,
    hasActivePause,
    at,
    expiringThreshold,
  });
}

describe("deriveClientPackageStatus", () => {
  it("returns none when the client has no packages", () => {
    expect(run([])).toBe("none");
  });

  it("returns paused when an active pause exists, whatever the packages say", () => {
    expect(
      run([{ sessionsRemaining: 5, expiresAt: new Date("2026-08-01T00:00:00.000Z") }], true),
    ).toBe("paused");
  });

  it("paused wins over an expired-only client too", () => {
    expect(
      run([{ sessionsRemaining: 0, expiresAt: new Date("2026-05-01T00:00:00.000Z") }], true),
    ).toBe("paused");
  });

  it("returns active for a package with sessions left and a far expiry", () => {
    expect(
      run([{ sessionsRemaining: 5, expiresAt: new Date("2026-08-01T00:00:00.000Z") }]),
    ).toBe("active");
  });

  it("returns expiring when the only live package expires inside the window", () => {
    expect(
      run([{ sessionsRemaining: 5, expiresAt: new Date("2026-06-10T00:00:00.000Z") }]),
    ).toBe("expiring");
  });

  it("a package expiring exactly on the threshold counts as expiring", () => {
    expect(run([{ sessionsRemaining: 5, expiresAt: expiringThreshold }])).toBe(
      "expiring",
    );
  });

  it("active beats expiring when the client holds both", () => {
    expect(
      run([
        { sessionsRemaining: 5, expiresAt: new Date("2026-06-10T00:00:00.000Z") },
        { sessionsRemaining: 5, expiresAt: new Date("2026-08-01T00:00:00.000Z") },
      ]),
    ).toBe("active");
  });

  it("returns expired when every package is past its expiry", () => {
    expect(
      run([{ sessionsRemaining: 5, expiresAt: new Date("2026-05-01T00:00:00.000Z") }]),
    ).toBe("expired");
  });

  it("a package with zero sessions left reads as expired, not active", () => {
    expect(
      run([{ sessionsRemaining: 0, expiresAt: new Date("2026-08-01T00:00:00.000Z") }]),
    ).toBe("expired");
  });

  it("a live package outranks a spent one", () => {
    expect(
      run([
        { sessionsRemaining: 0, expiresAt: new Date("2026-05-01T00:00:00.000Z") },
        { sessionsRemaining: 5, expiresAt: new Date("2026-08-01T00:00:00.000Z") },
      ]),
    ).toBe("active");
  });
});
