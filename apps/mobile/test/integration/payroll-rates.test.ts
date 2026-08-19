import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET, POST } from "@/server/routes/payroll/rates";
import { prisma } from "@/lib/server/prisma";

/**
 * Trainer commission rates, including the per-class-type overrides.
 *
 * A trainer's cut differs by what they teach, so a rate row can be scoped to
 * one class type. Ending an override is another append-only row — a NULL
 * percent on that scope — because deleting the row would rewrite months that
 * were already settled at the override.
 */

const ASOF = "2026-08-05T10:00:00.000Z";

async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Ana", lastName: "Trener", role: "TRAINER" },
  });
  const individual = await prisma.classType.create({
    data: { name: "Individualni", maxClients: 1, durationMins: 60 },
  });
  return { admin, trainer, individual };
}

function asUser(user: { id: string; email: string; role: string }) {
  setMockUser({
    id: user.id,
    role: user.role as "ADMIN" | "TRAINER" | "CLIENT",
    email: user.email,
    isActive: true,
    clientProfile: null,
  });
}

function postRate(body: Record<string, unknown>) {
  return new Request("http://test.local/api/payroll/rates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/payroll/rates", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await prisma.$disconnect();
  });

  it("stores a default rate with no class-type scope", async () => {
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST(
      postRate({
        trainerUserId: seeded.trainer.id,
        percent: 40,
        effectiveFrom: "2026-09-01",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate.classTypeId).toBeNull();
    expect(body.rate.classTypeName).toBeNull();
    expect(body.rate.percent).toBe(40);
  });

  it("scopes a rate to a class type and names it back", async () => {
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST(
      postRate({
        trainerUserId: seeded.trainer.id,
        classTypeId: seeded.individual.id,
        percent: 60,
        effectiveFrom: "2026-09-01",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate.classTypeId).toBe(seeded.individual.id);
    // The name comes back with the row so the rate list can label it without
    // a second round trip for the class-type catalogue.
    expect(body.rate.classTypeName).toBe("Individualni");
    expect(body.rate.percent).toBe(60);

    const stored = await prisma.trainerRate.findUnique({
      where: { id: body.rate.id },
      select: { classTypeId: true, percent: true },
    });
    expect(stored).toEqual({ classTypeId: seeded.individual.id, percent: 60 });
  });

  it("accepts a null percent on a scoped rate as the tombstone that ends it", async () => {
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST(
      postRate({
        trainerUserId: seeded.trainer.id,
        classTypeId: seeded.individual.id,
        percent: null,
        effectiveFrom: "2026-09-01",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate.percent).toBeNull();
    expect(body.rate.classTypeId).toBe(seeded.individual.id);
  });

  it("rejects a null percent with no class type — the default rate must be a number", async () => {
    // A tombstone means "go back to the default"; on the default scope itself
    // there is nothing to go back to, and the month would silently pay 0.
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST(
      postRate({
        trainerUserId: seeded.trainer.id,
        percent: null,
        effectiveFrom: "2026-09-01",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses an override for a class type that does not exist", async () => {
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST(
      postRate({
        trainerUserId: seeded.trainer.id,
        classTypeId: "00000000-0000-0000-0000-000000000000",
        percent: 60,
        effectiveFrom: "2026-09-01",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns the scope on every listed rate", async () => {
    const seeded = await seed();
    await prisma.trainerRate.create({
      data: {
        trainerUserId: seeded.trainer.id,
        percent: 40,
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    await prisma.trainerRate.create({
      data: {
        trainerUserId: seeded.trainer.id,
        classTypeId: seeded.individual.id,
        percent: 60,
        effectiveFrom: new Date("2026-02-01"),
      },
    });

    asUser(seeded.admin);
    const res = await GET(
      new Request(
        `http://test.local/api/payroll/rates?trainerUserId=${seeded.trainer.id}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const scoped = body.rates.find(
      (r: { classTypeId: string | null }) => r.classTypeId === seeded.individual.id,
    );
    const fallback = body.rates.find(
      (r: { classTypeId: string | null }) => r.classTypeId === null,
    );
    expect(scoped.classTypeName).toBe("Individualni");
    expect(scoped.percent).toBe(60);
    expect(fallback.classTypeName).toBeNull();
    expect(fallback.percent).toBe(40);
  });

  it("keeps rates admin-only in both directions", async () => {
    const seeded = await seed();
    asUser(seeded.trainer);

    expect(
      (await GET(new Request("http://test.local/api/payroll/rates"))).status,
    ).toBe(403);
    expect(
      (
        await POST(
          postRate({
            trainerUserId: seeded.trainer.id,
            percent: 40,
            effectiveFrom: "2026-09-01",
          }),
        )
      ).status,
    ).toBe(403);
  });
});
