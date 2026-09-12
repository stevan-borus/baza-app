import { describe, it, expect } from "vitest";
import {
  ACTIVE_VERSIONS,
  GATE_DOCUMENT_KEYS_FOR_ROLE,
  MUST_ANSWER_KEYS_FOR_ROLE,
} from "@/lib/legal/versions";

describe("ACTIVE_VERSIONS", () => {
  it("registers social_media v1 and health_intake v1", () => {
    expect(ACTIVE_VERSIONS.social_media).toBe(1);
    expect(ACTIVE_VERSIONS.health_intake).toBe(1);
  });
  it("registers marketing v1 so consent records are versioned", () => {
    expect(ACTIVE_VERSIONS.marketing).toBe(1);
  });
});

describe("MUST_ANSWER_KEYS_FOR_ROLE", () => {
  it("requires CLIENT to answer social_media", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.CLIENT).toContain("social_media");
  });
  it("requires CLIENT to answer marketing", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.CLIENT).toContain("marketing");
  });
  it("never gates a DOCUMENT on marketing — ZZPL čl. 15 forbids bundling it", () => {
    expect(GATE_DOCUMENT_KEYS_FOR_ROLE.CLIENT).not.toContain("marketing");
    expect(GATE_DOCUMENT_KEYS_FOR_ROLE.ADMIN).not.toContain("marketing");
    expect(GATE_DOCUMENT_KEYS_FOR_ROLE.TRAINER).not.toContain("marketing");
  });
  it("does not gate ADMIN or TRAINER on social_media", () => {
    expect(MUST_ANSWER_KEYS_FOR_ROLE.ADMIN).toEqual([]);
    expect(MUST_ANSWER_KEYS_FOR_ROLE.TRAINER).toEqual([]);
  });
});
