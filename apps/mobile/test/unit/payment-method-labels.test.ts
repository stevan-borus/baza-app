import { describe, expect, it } from "vitest";
import {
  RAW_METHOD_LABEL_KEYS,
  softenedMethodLabelKey,
} from "@/lib/payment-method-labels";

describe("RAW_METHOD_LABEL_KEYS (admin, raw chips)", () => {
  it("maps every raw PaymentMethod to an admin.manage.* key", () => {
    expect(RAW_METHOD_LABEL_KEYS).toEqual({
      CASH: "admin.manage.methodCash",
      CARD: "admin.manage.methodCard",
      COMPANY: "admin.manage.methodCompany",
      MANUAL_ONLINE: "admin.manage.methodOnline",
    });
  });
});

describe("softenedMethodLabelKey (client, softened chips)", () => {
  it("maps the four softened values to client.clientPackages.* keys", () => {
    expect(softenedMethodLabelKey("CASH")).toBe(
      "client.clientPackages.methodCash",
    );
    expect(softenedMethodLabelKey("CARD")).toBe(
      "client.clientPackages.methodCard",
    );
    expect(softenedMethodLabelKey("ONLINE")).toBe(
      "client.clientPackages.methodOnline",
    );
    // COMPANY is softened to PAID upstream; the client never sees the raw chip.
    expect(softenedMethodLabelKey("PAID")).toBe("client.clientPackages.paid");
  });

  it("returns null when there is no method (comp entry)", () => {
    expect(softenedMethodLabelKey(null)).toBeNull();
  });
});
