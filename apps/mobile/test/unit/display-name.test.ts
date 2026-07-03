import { describe, expect, it } from "vitest";
import { displayName } from "@baza/types/common";

describe("displayName", () => {
  it("returns the full name when first and last are present", () => {
    expect(
      displayName({ firstName: "Ana", lastName: "Petrović", email: "a@x.test" }),
    ).toBe("Ana Petrović");
  });

  it("preserves a multi-part first name (the greeting-bug case)", () => {
    expect(
      displayName({
        firstName: "Ana Maria",
        lastName: "Petrović",
        email: "client.multipart-name@e2e.test",
      }),
    ).toBe("Ana Maria Petrović");
  });

  it("falls back to the email local-part when the name is missing", () => {
    expect(
      displayName({ firstName: "", lastName: "", email: "client.multipart-name@e2e.test" }),
    ).toBe("client.multipart-name");

    expect(displayName({ email: "ana@e2e.test" })).toBe("ana");
  });

  it("returns an empty string when nothing is available", () => {
    expect(displayName({})).toBe("");
    expect(displayName(undefined)).toBe("");
  });
});
