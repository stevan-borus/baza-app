import { describe, expect, test } from "vitest";
import { resolveNotificationHref } from "@/lib/notification-routing";

describe("resolveNotificationHref", () => {
  describe("BIRTHDAY_ADMIN_PROMPT", () => {
    test("with matching gift PackageType → pre-selects packageTypeId", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-reformer",
        },
        giftPackageTypes: [
          { id: "pt-gift-reformer", classTypeIds: ["ct-reformer"] },
          { id: "pt-gift-mat", classTypeIds: ["ct-mat"] },
        ],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-gift-reformer",
      );
    });

    test("with no matching gift PackageType → routes without packageTypeId", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-unknown",
        },
        giftPackageTypes: [
          { id: "pt-gift-reformer", classTypeIds: ["ct-reformer"] },
        ],
      });
      expect(href).toBe("/(admin)/klijenti?openAssignPackage=cp-123&mode=comp");
    });

    test("with null suggestedClassTypeId → routes without packageTypeId", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: null,
        },
        giftPackageTypes: [
          { id: "pt-gift-reformer", classTypeIds: ["ct-reformer"] },
        ],
      });
      expect(href).toBe("/(admin)/klijenti?openAssignPackage=cp-123&mode=comp");
    });

    test("with missing clientProfileId → returns null", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: { suggestedClassTypeId: "ct-reformer" },
        giftPackageTypes: [],
      });
      expect(href).toBeNull();
    });
  });

  describe("BOOKING_CANCELED_ADMIN", () => {
    test("with sessionId → routes to /pregled/sessions/[id]", () => {
      const href = resolveNotificationHref({
        type: "BOOKING_CANCELED_ADMIN",
        payload: { sessionId: "sess-42" },
        giftPackageTypes: [],
      });
      expect(href).toBe("/(admin)/pregled/sessions/sess-42");
    });

    test("with missing sessionId → returns null", () => {
      const href = resolveNotificationHref({
        type: "BOOKING_CANCELED_ADMIN",
        payload: {},
        giftPackageTypes: [],
      });
      expect(href).toBeNull();
    });
  });

  describe("MINOR_PAPER_NEEDED", () => {
    test("with clientUserId → routes to /klijenti/[id]", () => {
      const href = resolveNotificationHref({
        type: "MINOR_PAPER_NEEDED",
        payload: { sessionId: "sess-9", clientUserId: "u-7", userName: "Mark" },
        giftPackageTypes: [],
      });
      expect(href).toBe("/(admin)/klijenti/u-7");
    });

    test("with missing clientUserId → returns null", () => {
      const href = resolveNotificationHref({
        type: "MINOR_PAPER_NEEDED",
        payload: { sessionId: "sess-9" },
        giftPackageTypes: [],
      });
      expect(href).toBeNull();
    });
  });

  describe("PACKAGE_ASSIGNED", () => {
    test("routes to the client's packages view", () => {
      const href = resolveNotificationHref({
        type: "PACKAGE_ASSIGNED",
        payload: { clientPackageId: "cpkg-1", packageTypeName: "10 Reformer" },
        giftPackageTypes: [],
      });
      expect(href).toBe("/(client)/profile/packages");
    });

    test("with null payload → still routes to the packages view", () => {
      const href = resolveNotificationHref({
        type: "PACKAGE_ASSIGNED",
        payload: null,
        giftPackageTypes: [],
      });
      expect(href).toBe("/(client)/profile/packages");
    });
  });

  describe("unhandled types", () => {
    test("BOOKING_CONFIRMED → returns null (no admin destination)", () => {
      const href = resolveNotificationHref({
        type: "BOOKING_CONFIRMED",
        payload: { sessionId: "sess-1" },
        giftPackageTypes: [],
      });
      expect(href).toBeNull();
    });

    test("null payload → returns null", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: null,
        giftPackageTypes: [],
      });
      expect(href).toBeNull();
    });
  });
});
