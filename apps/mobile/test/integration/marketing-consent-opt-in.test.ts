/**
 * Marketing email is opt-IN, not opt-out.
 *
 * Serbian Law on Electronic Commerce Art. 8 permits a commercial message only
 * with the recipient's prior consent, and ZZPL Art. 4(1)(12) requires a clear
 * affirmative action — silence is not consent. So a client with no preference
 * row has NOT consented, and every read of campaignsEnabled must treat
 * absent/null as false.
 *
 * See docs/legal/serbia-marketing-consent-research.md.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () =>
  (await import("./auth-mock")).authGuardsMock(),
);
vi.mock("@/lib/server/resend", () => ({
  sendCampaignEmail: vi.fn(async () => undefined),
}));

import { resolveCampaignAudienceMembers } from "@/lib/server/campaign-audience";
import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import {
  GET as prefsGET,
  PATCH as prefsPATCH,
} from "@/server/routes/notifications/preferences";
import { POST as marketingPOST } from "@/server/routes/consent/marketing";
import { GET as statusGET } from "@/server/routes/consent/status";
import { prisma } from "@/lib/server/prisma";

async function makeClient(email: string, { asMockUser = true } = {}) {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: "C",
      lastName: email,
      role: "CLIENT",
      isActive: true,
    },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id, dateOfBirth: new Date("1990-01-01") },
  });
  if (asMockUser) {
    setMockUser({
      id: user.id,
      role: "CLIENT",
      email: user.email,
      isActive: true,
      clientProfile: { id: profile.id },
    });
  }
  return user;
}

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("marketing consent is opt-in", () => {
  beforeEach(async () => {
    await resetDb();
    setMockUser(null);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("audience membership", () => {
    it("a client with NO preference row is NOT marketable", async () => {
      await makeClient("nopref@e2e.test");

      const members = await resolveCampaignAudienceMembers({ everyone: true });

      expect(members).toHaveLength(1);
      expect(members[0]!.campaignsEnabled).toBe(false);
    });

    it("a client who explicitly opted in IS marketable", async () => {
      const user = await makeClient("optedin@e2e.test");
      await prisma.notificationPreference.create({
        data: { userId: user.id, campaignsEnabled: true },
      });

      const members = await resolveCampaignAudienceMembers({ everyone: true });

      expect(members[0]!.campaignsEnabled).toBe(true);
    });

    it("a client who opted out is NOT marketable", async () => {
      const user = await makeClient("optedout@e2e.test");
      await prisma.notificationPreference.create({
        data: { userId: user.id, campaignsEnabled: false },
      });

      const members = await resolveCampaignAudienceMembers({ everyone: true });

      expect(members[0]!.campaignsEnabled).toBe(false);
    });
  });

  describe("the column default", () => {
    it("a preference row created without campaignsEnabled defaults to false", async () => {
      const user = await makeClient("default@e2e.test");
      await prisma.notificationPreference.create({ data: { userId: user.id } });

      const pref = await prisma.notificationPreference.findUniqueOrThrow({
        where: { userId: user.id },
      });

      expect(pref.campaignsEnabled).toBe(false);
      // The transactional flags are unaffected — they are not commercial
      // messages under Art. 3(6) and keep their opt-out semantics.
      expect(pref.pushEnabled).toBe(true);
      expect(pref.inAppEnabled).toBe(true);
      expect(pref.bookingEmailsEnabled).toBe(true);
    });
  });

  describe("GET /api/notifications/preferences", () => {
    it("materializes a row with campaignsEnabled=false for a fresh client", async () => {
      await makeClient("freshprefs@e2e.test");

      const res = await prefsGET(
        new Request("http://test.local/api/notifications/preferences"),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.preferences.campaignsEnabled).toBe(false);
      expect(body.preferences.bookingEmailsEnabled).toBe(true);
    });

    it("PATCH of an unrelated flag does not silently opt the client in", async () => {
      await makeClient("patchother@e2e.test");

      const res = await prefsPATCH(
        new Request("http://test.local/api/notifications/preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pushEnabled: false }),
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.preferences.pushEnabled).toBe(false);
      expect(body.preferences.campaignsEnabled).toBe(false);
    });
  });

  describe("dispatch", () => {
    it("never sends to a client with no preference row", async () => {
      await makeClient("nopref.dispatch@e2e.test", { asMockUser: false });
      const admin = await prisma.user.create({
        data: {
          email: "admin.dispatch@e2e.test",
          firstName: "A",
          lastName: "D",
          role: "ADMIN",
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          createdByUserId: admin.id,
          title: "Novi programi",
          body: "Dolaze novi programi u studio.",
          audienceSpec: { everyone: true },
          status: "DRAFT",
        },
      });

      const sent = await dispatchCampaign(campaign.id);

      expect(sent.recipientCount).toBe(0);
      const logs = await prisma.notificationLog.findMany({
        where: { campaignId: campaign.id },
      });
      expect(logs).toHaveLength(0);
    });
  });

  describe("POST /api/consent/marketing", () => {
    it("records an append-only ConsentRecord and mirrors the flag on accept", async () => {
      const user = await makeClient("consent.yes@e2e.test");

      const res = await marketingPOST(
        jsonReq("http://test.local/api/consent/marketing", { accepted: true }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.record.accepted).toBe(true);

      const records = await prisma.consentRecord.findMany({
        where: { userId: user.id, documentKey: "marketing" },
      });
      expect(records).toHaveLength(1);
      expect(records[0]!.accepted).toBe(true);
      expect(records[0]!.version).toBeGreaterThan(0);
      expect(records[0]!.acceptedAt).toBeInstanceOf(Date);

      const pref = await prisma.notificationPreference.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(pref.campaignsEnabled).toBe(true);
    });

    it("records a refusal without enabling campaigns", async () => {
      const user = await makeClient("consent.no@e2e.test");

      await marketingPOST(
        jsonReq("http://test.local/api/consent/marketing", { accepted: false }),
      );

      const records = await prisma.consentRecord.findMany({
        where: { userId: user.id, documentKey: "marketing" },
      });
      expect(records).toHaveLength(1);
      expect(records[0]!.accepted).toBe(false);

      const pref = await prisma.notificationPreference.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(pref.campaignsEnabled).toBe(false);
    });

    it("appends a new row on withdrawal rather than mutating the first", async () => {
      const user = await makeClient("consent.withdraw@e2e.test");

      await marketingPOST(
        jsonReq("http://test.local/api/consent/marketing", { accepted: true }),
      );
      await marketingPOST(
        jsonReq("http://test.local/api/consent/marketing", { accepted: false }),
      );

      const records = await prisma.consentRecord.findMany({
        where: { userId: user.id, documentKey: "marketing" },
        orderBy: { acceptedAt: "desc" },
      });
      expect(records).toHaveLength(2);
      expect(records.filter((r) => r.accepted)).toHaveLength(1);
      expect(records.filter((r) => !r.accepted)).toHaveLength(1);

      const pref = await prisma.notificationPreference.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(pref.campaignsEnabled).toBe(false);
    });
  });

  describe("GET /api/consent/status", () => {
    it("reports marketing as undecided for a client who has never answered", async () => {
      await makeClient("status.undecided@e2e.test");

      const res = await statusGET(
        new Request("http://test.local/api/consent/status"),
      );
      const body = await res.json();

      expect(body.marketingDecided).toBe(false);
      expect(body.marketingLatestAccepted).toBe(null);
    });

    it("reports the latest marketing answer once decided", async () => {
      await makeClient("status.decided@e2e.test");
      await marketingPOST(
        jsonReq("http://test.local/api/consent/marketing", { accepted: true }),
      );

      const res = await statusGET(
        new Request("http://test.local/api/consent/status"),
      );
      const body = await res.json();

      expect(body.marketingDecided).toBe(true);
      expect(body.marketingLatestAccepted).toBe(true);
    });
  });
});
