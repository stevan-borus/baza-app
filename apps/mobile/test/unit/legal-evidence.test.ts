import { describe, it, expect } from "vitest";
import { extractEvidence } from "@/lib/legal/evidence";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/consent/accept", {
    method: "POST",
    headers: new Headers(headers),
  });
}

describe("extractEvidence", () => {
  it("reads ip from x-forwarded-for (first value)", () => {
    const ev = extractEvidence(
      makeRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }),
    );
    expect(ev.ipAddress).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const ev = extractEvidence(makeRequest({ "x-real-ip": "203.0.113.2" }));
    expect(ev.ipAddress).toBe("203.0.113.2");
  });

  it("captures user-agent verbatim", () => {
    const ev = extractEvidence(
      makeRequest({ "user-agent": "BazaApp/1.2.3 iPhone" }),
    );
    expect(ev.userAgent).toBe("BazaApp/1.2.3 iPhone");
  });

  it("captures app version from x-baza-app-version header", () => {
    const ev = extractEvidence(
      makeRequest({ "x-baza-app-version": "1.2.3" }),
    );
    expect(ev.appVersion).toBe("1.2.3");
  });

  it("returns null fields when headers are missing", () => {
    const ev = extractEvidence(makeRequest({}));
    expect(ev).toEqual({
      ipAddress: null,
      userAgent: null,
      appVersion: null,
    });
  });
});
