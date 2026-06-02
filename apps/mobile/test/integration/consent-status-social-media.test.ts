import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { resetDb } from "./setup-db";

describe("getConsentStatus — socialMediaDecided + socialMediaLatestAccepted", () => {
  let adultClientId: string;
  let adminId: string;

  beforeEach(async () => {
    await resetDb();
    const adult = await prisma.user.create({
      data: {
        email: "adult-social@t.local",
        firstName: "Adult",
        lastName: "Client",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
    });
    const admin = await prisma.user.create({
      data: { email: "admin-social@t.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
    });
    adultClientId = adult.id;
    adminId = admin.id;
  });

  it("client with no social_media record: socialMediaDecided=false, latest=null", async () => {
    const status = await getConsentStatus(adultClientId);
    expect(status.socialMediaDecided).toBe(false);
    expect(status.socialMediaLatestAccepted).toBeNull();
  });

  it("client with a Da row: decided=true, latest=true", async () => {
    await prisma.consentRecord.create({
      data: {
        userId: adultClientId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: true,
      },
    });
    const status = await getConsentStatus(adultClientId);
    expect(status.socialMediaDecided).toBe(true);
    expect(status.socialMediaLatestAccepted).toBe(true);
  });

  it("client with a Ne row: decided=true, latest=false (Ne is still decided)", async () => {
    await prisma.consentRecord.create({
      data: {
        userId: adultClientId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: false,
      },
    });
    const status = await getConsentStatus(adultClientId);
    expect(status.socialMediaDecided).toBe(true);
    expect(status.socialMediaLatestAccepted).toBe(false);
  });

  it("client with multiple rows: latest reflects the most recent acceptedAt", async () => {
    // First: Da, then later: Ne
    await prisma.consentRecord.create({
      data: {
        userId: adultClientId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: true,
        acceptedAt: new Date("2026-01-01T10:00:00Z"),
      },
    });
    await prisma.consentRecord.create({
      data: {
        userId: adultClientId,
        documentKey: "social_media",
        version: ACTIVE_VERSIONS.social_media,
        locale: "sr",
        accepted: false,
        acceptedAt: new Date("2026-02-01T10:00:00Z"),
      },
    });
    const status = await getConsentStatus(adultClientId);
    expect(status.socialMediaDecided).toBe(true);
    expect(status.socialMediaLatestAccepted).toBe(false);
  });

  it("admin: both fields are still populated and don't fail (false / null)", async () => {
    const status = await getConsentStatus(adminId);
    expect(status.socialMediaDecided).toBe(false);
    expect(status.socialMediaLatestAccepted).toBeNull();
  });
});
