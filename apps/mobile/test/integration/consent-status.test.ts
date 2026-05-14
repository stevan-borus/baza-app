import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { now } from "@/lib/now";
import { resetDb } from "./setup-db";

describe("getConsentStatus", () => {
  let adminId: string;
  let adultClientId: string;
  let minorClientId: string;

  beforeEach(async () => {
    await resetDb();

    const admin = await prisma.user.create({
      data: { email: "a@t.local", fullName: "Admin", role: "ADMIN" },
    });
    const adultUser = await prisma.user.create({
      data: {
        email: "adult@t.local",
        fullName: "Adult Client",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
    });
    const minorUser = await prisma.user.create({
      data: {
        email: "minor@t.local",
        fullName: "Minor Client",
        role: "CLIENT",
        clientProfile: {
          create: { dateOfBirth: new Date(now().getFullYear() - 12, 0, 1) },
        },
      },
    });
    adminId = admin.id;
    adultClientId = adultUser.id;
    minorClientId = minorUser.id;
  });

  it("admin with no records: tos/privacy/eula pending as missing", async () => {
    const status = await getConsentStatus(adminId);
    expect(status.pending.map((p) => p.key).sort()).toEqual([
      "eula",
      "privacy",
      "tos",
    ]);
    expect(status.pending.every((p) => p.reason === "missing")).toBe(true);
    expect(status.guardianVerificationNeeded).toBe(false);
  });

  it("adult client with no records: tos/privacy/eula/waiver_adult pending", async () => {
    const status = await getConsentStatus(adultClientId);
    expect(status.pending.map((p) => p.key).sort()).toEqual([
      "eula",
      "privacy",
      "tos",
      "waiver_adult",
    ]);
  });

  it("minor client with no records: tos/privacy/eula/waiver_minor pending", async () => {
    const status = await getConsentStatus(minorClientId);
    expect(status.pending.map((p) => p.key).sort()).toEqual([
      "eula",
      "privacy",
      "tos",
      "waiver_minor",
    ]);
  });

  it("user with all current-version accepted records: no pending", async () => {
    for (const key of ["tos", "privacy", "eula"] as const) {
      await prisma.consentRecord.create({
        data: {
          userId: adminId,
          documentKey: key,
          version: 1,
          locale: "sr",
          accepted: true,
        },
      });
    }
    const status = await getConsentStatus(adminId);
    expect(status.pending).toEqual([]);
  });

  it("outdated version: pending with reason='outdated'", async () => {
    // Accept v0 (older than ACTIVE_VERSIONS.tos = 1)
    await prisma.consentRecord.create({
      data: {
        userId: adminId,
        documentKey: "tos",
        version: 0,
        locale: "sr",
        accepted: true,
      },
    });
    await prisma.consentRecord.create({
      data: {
        userId: adminId,
        documentKey: "privacy",
        version: 1,
        locale: "sr",
        accepted: true,
      },
    });
    await prisma.consentRecord.create({
      data: {
        userId: adminId,
        documentKey: "eula",
        version: 1,
        locale: "sr",
        accepted: true,
      },
    });
    const status = await getConsentStatus(adminId);
    expect(status.pending).toHaveLength(1);
    expect(status.pending[0]).toEqual({
      key: "tos",
      currentVersion: 1,
      reason: "outdated",
    });
  });
});
