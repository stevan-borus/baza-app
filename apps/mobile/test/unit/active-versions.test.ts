import { describe, it, expect } from "vitest";
import { ACTIVE_VERSIONS, MUST_ANSWER_KEYS_FOR_ROLE } from "@/lib/legal/versions";

describe("ACTIVE_VERSIONS", () => {
  it("registers social_media v1 and health_intake v1", () => {
    expect(ACTIVE_VERSIONS.social_media).toBe(1);
    expect(ACTIVE_VERSIONS.health_intake).toBe(1);
  });
});

describe("MUST_ANSWER_KEYS_FOR_ROLE", () => {
  it("requires CLIENT to answer social_media", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.CLIENT).toContain("social_media");
  });
  it("does not gate ADMIN or TRAINER on social_media", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.ADMIN).toEqual([]);
    expect(MUST_ANSWER_KEYS_FOR_ROLE.TRAINER).toEqual([]);
  });
});
