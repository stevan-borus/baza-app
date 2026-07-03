import { describe, expect, it } from "vitest";
import { appVersionResponseSchema, healthResponseSchema } from "../src/system";

describe("healthResponseSchema", () => {
  it("accepts the health payload", () => {
    expect(
      healthResponseSchema.safeParse({
        success: true,
        service: "baza-api",
        status: "ok",
        ts: "2026-07-03T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("appVersionResponseSchema", () => {
  it("accepts the app-version payload the update hook parses", () => {
    expect(
      appVersionResponseSchema.safeParse({
        success: true,
        platform: "ios",
        minVersion: "1.0.0",
        latestVersion: "1.2.0",
      }).success,
    ).toBe(true);
  });
  it("rejects an unknown platform", () => {
    expect(
      appVersionResponseSchema.safeParse({
        success: true,
        platform: "web",
        minVersion: "1.0.0",
        latestVersion: "1.2.0",
      }).success,
    ).toBe(false);
  });
});
