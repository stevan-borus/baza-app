import { describe, expect, test } from "vitest";
import { resolveNotificationHref } from "@/lib/notification-routing";

describe("resolveNotificationHref", () => {
  describe("BIRTHDAY_ADMIN_PROMPT", () => {
    test("exactly one gift SKU → preselects it regardless of covered class type", () => {
      // The gift SKU no longer has to cover the suggested class type — one SKU
      // now serves every class type via the assign-sheet picker.
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-reformer",
        },
        giftPackageTypes: [{ id: "pt-gift", classTypeIds: ["ct-mat"] }],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-gift&initialClassTypeId=ct-reformer",
      );
    });

    test("several gift SKUs → includes-match tiebreak wins (first match)", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-reformer",
        },
        giftPackageTypes: [
          { id: "pt-gift-mat", classTypeIds: ["ct-mat"] },
          { id: "pt-gift-reformer", classTypeIds: ["ct-reformer"] },
          { id: "pt-gift-reformer-2", classTypeIds: ["ct-reformer"] },
        ],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-gift-reformer&initialClassTypeId=ct-reformer",
      );
    });

    test("several gift SKUs, none match → falls back to the first gift SKU", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-unknown",
        },
        giftPackageTypes: [
          { id: "pt-gift-mat", classTypeIds: ["ct-mat"] },
          { id: "pt-gift-reformer", classTypeIds: ["ct-reformer"] },
        ],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-gift-mat&initialClassTypeId=ct-unknown",
      );
    });

    test("no gift SKUs → routes without a preselection but keeps the class-type hint", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-reformer",
        },
        giftPackageTypes: [],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialClassTypeId=ct-reformer",
      );
    });

    test("system gift is preselected over legacy gift SKUs, regardless of order or covered set", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-reformer",
        },
        giftPackageTypes: [
          { id: "pt-legacy-reformer", classTypeIds: ["ct-reformer"] },
          { id: "pt-system", classTypeIds: [], isSystem: true },
          { id: "pt-legacy-mat", classTypeIds: ["ct-mat"] },
        ],
      });
      // The system gift wins even though a legacy SKU covers the suggested
      // class type and the system row has no covered set of its own.
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-system&initialClassTypeId=ct-reformer",
      );
    });

    test("no system gift, only legacy SKUs → legacy single/tiebreak fallback still applies", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: "ct-reformer",
        },
        giftPackageTypes: [
          { id: "pt-legacy-mat", classTypeIds: ["ct-mat"], isSystem: false },
          { id: "pt-legacy-reformer", classTypeIds: ["ct-reformer"], isSystem: false },
        ],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-legacy-reformer&initialClassTypeId=ct-reformer",
      );
    });

    test("with null suggestedClassTypeId → still preselects the single gift SKU", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: {
          clientProfileId: "cp-123",
          suggestedClassTypeId: null,
        },
        giftPackageTypes: [{ id: "pt-gift", classTypeIds: ["ct-reformer"] }],
      });
      expect(href).toBe(
        "/(admin)/klijenti?openAssignPackage=cp-123&mode=comp&initialPackageTypeId=pt-gift",
      );
    });

    test("with missing clientProfileId → returns null", () => {
      const href = resolveNotificationHref({
        type: "BIRTHDAY_ADMIN_PROMPT",
        payload: { suggestedClassTypeId: "ct-reformer" },
        giftPackageTypes: [{ id: "pt-gift", classTypeIds: ["ct-reformer"] }],
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
