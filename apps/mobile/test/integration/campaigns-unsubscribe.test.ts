import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./setup-db";
import { signUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";
import { GET as UNSUB } from "@/app/api/unsubscribe/+api";
import { prisma } from "@/lib/server/prisma";

describe("GET /api/unsubscribe", () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it("flips campaignsEnabled=false for a valid token with no login", async () => {
    const u = await prisma.user.create({ data: { email: "c@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });
    const res = await UNSUB(new Request(`http://test.local/api/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(u.id))}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(false);
  });
  it("upserts a preference row when none exists yet", async () => {
    const u = await prisma.user.create({ data: { email: "c2@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    const res = await UNSUB(new Request(`http://test.local/api/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(u.id))}`));
    expect(res.status).toBe(200);
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(false);
  });
  it("rejects a forged token without changing anything", async () => {
    const u = await prisma.user.create({ data: { email: "c3@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });
    const res = await UNSUB(new Request("http://test.local/api/unsubscribe?token=forged.deadbeef"));
    expect(res.status).toBe(400);
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(true);
  });
});
