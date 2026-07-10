import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./setup-db";
import { signUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";
import { GET as UNSUB_GET, POST as UNSUB_POST } from "@/server/routes/unsubscribe";
import { prisma } from "@/lib/server/prisma";

function url(userId: string, lang?: string) {
  const q = `token=${encodeURIComponent(signUnsubscribeToken(userId))}${lang ? `&lang=${lang}` : ""}`;
  return `http://test.local/api/unsubscribe?${q}`;
}

describe("GET /api/unsubscribe — confirmation page (must NOT mutate)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("renders a confirmation page with a POST form and does NOT opt the user out", async () => {
    // Email scanners / link prefetchers issue automated GETs against the URL in
    // the email body. GET must be safe — it only shows a confirm page.
    const u = await prisma.user.create({ data: { email: "c@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });

    const res = await UNSUB_GET(new Request(url(u.id)));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    // A POST form is present so the actual opt-out requires a deliberate submit.
    expect(body).toContain('method="post"');
    // Still subscribed — GET changed nothing.
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(true);
  });

  it("shows an error page for a forged token", async () => {
    const res = await UNSUB_GET(new Request("http://test.local/api/unsubscribe?token=forged.deadbeef"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/unsubscribe — performs the opt-out", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("flips campaignsEnabled=false for a valid token with no login", async () => {
    const u = await prisma.user.create({ data: { email: "c@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });

    const res = await UNSUB_POST(new Request(url(u.id), { method: "POST" }));
    expect(res.status).toBe(200);
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(false);
  });

  it("upserts a preference row when none exists yet", async () => {
    const u = await prisma.user.create({ data: { email: "c2@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    const res = await UNSUB_POST(new Request(url(u.id), { method: "POST" }));
    expect(res.status).toBe(200);
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(false);
  });

  it("rejects a forged token without changing anything", async () => {
    const u = await prisma.user.create({ data: { email: "c3@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });
    const res = await UNSUB_POST(new Request("http://test.local/api/unsubscribe?token=forged.deadbeef", { method: "POST" }));
    expect(res.status).toBe(400);
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(true);
  });

  it("is idempotent — a second POST keeps the user opted out", async () => {
    const u = await prisma.user.create({ data: { email: "c4@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });
    await UNSUB_POST(new Request(url(u.id), { method: "POST" }));
    const res = await UNSUB_POST(new Request(url(u.id), { method: "POST" }));
    expect(res.status).toBe(200);
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: u.id } })).campaignsEnabled).toBe(false);
  });
});
