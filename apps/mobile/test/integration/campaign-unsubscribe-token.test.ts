import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";

describe("unsubscribe token", () => {
  it("round-trips a userId", () => {
    const token = signUnsubscribeToken("user-123");
    expect(verifyUnsubscribeToken(token)).toBe("user-123");
  });
  it("rejects a forged signature", () => {
    const token = signUnsubscribeToken("user-123");
    expect(verifyUnsubscribeToken(token.slice(0, -2) + "00")).toBeNull();
  });
  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });
  it("rejects a token whose userId was substituted", () => {
    const token = signUnsubscribeToken("user-A");
    const otherId = Buffer.from("user-B", "utf8").toString("base64url");
    const sig = token.slice(token.lastIndexOf(".") + 1);
    expect(verifyUnsubscribeToken(`${otherId}.${sig}`)).toBeNull();
  });
});
