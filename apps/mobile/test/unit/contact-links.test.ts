import { describe, expect, it } from "vitest";
import { contactLinks } from "@/lib/contact-links";

describe("contactLinks", () => {
  it("builds a tel: URL preserving the leading +", () => {
    expect(contactLinks("+38169333443").tel).toBe("tel:+38169333443");
  });

  it("builds an sms: URL preserving the leading +", () => {
    expect(contactLinks("+38169333443").sms).toBe("sms:+38169333443");
  });

  it("builds a wa.me WhatsApp URL with digits only (no +, spaces, or dashes)", () => {
    expect(contactLinks("+381 69 333-443").whatsapp).toBe(
      "https://wa.me/38169333443",
    );
  });

  it("strips formatting from tel:/sms: so a spaced number still dials", () => {
    const links = contactLinks("+381 69 333-443");
    expect(links.tel).toBe("tel:+38169333443");
    expect(links.sms).toBe("sms:+38169333443");
  });
});
