import { describe, expect, it } from "vitest";
import { buildInviteUrl, buildResetUrl } from "@/lib/server/email-urls";

describe("buildInviteUrl", () => {
  it("points at the /accept-invite route (the real Expo Router page), not /auth/activate", () => {
    const url = buildInviteUrl("https://app.example.com", "raw-token");
    expect(url).toBe("https://app.example.com/accept-invite?token=raw-token");
  });

  it("url-encodes the token so reserved characters survive the query string", () => {
    const url = buildInviteUrl("https://app.example.com", "a/b+c=d&e");
    expect(url).toBe(
      "https://app.example.com/accept-invite?token=a%2Fb%2Bc%3Dd%26e",
    );
  });
});

describe("buildResetUrl", () => {
  it("points at the /reset-password route, not /auth/reset-password", () => {
    const url = buildResetUrl("https://app.example.com", "raw-token");
    expect(url).toBe("https://app.example.com/reset-password?token=raw-token");
  });
});
