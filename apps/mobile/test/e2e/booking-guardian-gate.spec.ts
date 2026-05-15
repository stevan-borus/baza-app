/**
 * E2E: booking-level guardian verification gate.
 *
 * Proves the gate added in Task 11:
 *   - After a completed session for an unverified minor, the next
 *     booking returns 409 GUARDIAN_VERIFICATION_REQUIRED.
 *   - Admin-set guardianVerifiedAt unblocks further bookings.
 *
 * Scope: API-driven through page.request after a UI sign-in (so the
 * spec uses a real authenticated session cookie). The booking UI itself
 * surfaces this error generically; the test target is the SERVER gate.
 *
 * Setup: the rich seed adds a pre-onboarded minor (12-year-old) with
 * waiver_minor + tos/privacy/eula consent rows so the legal gate doesn't
 * intercept. The spec sets up a completed session + bookable sessions
 * via direct prisma writes in beforeAll.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const MINOR_EMAIL = "client.minor-booking@e2e.test";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Per-spec prisma client — kept separate from helpers/db.ts so we can
// dispose cleanly in afterAll without fighting their connection lifecycle.
let specPool: Pool | null = null;
let specPrisma: PrismaClient | null = null;
function prisma(): PrismaClient {
  if (!specPrisma) {
    specPool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaPg(specPool);
    specPrisma = new PrismaClient({ adapter });
  }
  return specPrisma;
}
async function disconnectSpec() {
  if (specPrisma) {
    await specPrisma.$disconnect();
    specPrisma = null;
  }
  if (specPool) {
    await specPool.end();
    specPool = null;
  }
}

async function signInAsMinor(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill(MINOR_EMAIL);
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  // Minor's consent is pre-seeded so they should land on a client tab,
  // not /consent.
  await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 15_000 });
}

test.describe("booking — guardian verification gate", () => {
  let bookableSessionA: string;
  let bookableSessionB: string;
  let minorUserId: string;

  test.beforeAll(async () => {
    await resetAndSeed();

    const p = prisma();
    const minor = await p.user.findUniqueOrThrow({
      where: { email: MINOR_EMAIL },
      include: { clientProfile: true },
    });
    if (!minor.clientProfile) throw new Error("Minor has no client profile");
    minorUserId = minor.id;
    const profileId = minor.clientProfile.id;

    const reformerClassType = await p.classType.findFirstOrThrow({
      where: { name: "Reformer pilates" },
      select: { id: true },
    });
    const reformerPackageType = await p.packageType.findFirstOrThrow({
      where: { name: "Reformer 12-pack" },
      select: {
        id: true,
        lateCancelHours: true,
        sessionCount: true,
        validityDays: true,
      },
    });
    const room = await p.studioRoom.findFirstOrThrow({ select: { id: true } });
    const trainer = await p.user.findFirstOrThrow({
      where: { role: "TRAINER" },
      select: { id: true },
    });
    const nowMs = new Date(
      process.env.TEST_ANCHOR_TIME ?? "2026-05-11T09:00:00Z",
    ).getTime();

    // Give the minor a reformer package so booking has eligible packages.
    await p.clientPackage.create({
      data: {
        clientProfileId: profileId,
        packageTypeId: reformerPackageType.id,
        classTypeId: reformerClassType.id,
        lateCancelHours: reformerPackageType.lateCancelHours,
        sessionsRemaining: reformerPackageType.sessionCount,
        startsAt: new Date(nowMs - 30 * DAY_MS),
        expiresAt: new Date(nowMs + 60 * DAY_MS),
      },
    });

    // Completed past session — the gate triggers once the minor has at
    // least one COMPLETED session.
    const completedStart = new Date(nowMs - 14 * DAY_MS);
    const completed = await p.session.create({
      data: {
        classTypeId: reformerClassType.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: completedStart,
        endsAt: new Date(completedStart.getTime() + HOUR_MS),
        capacity: 6,
        status: "COMPLETED",
      },
      select: { id: true },
    });
    await p.booking.create({
      data: { sessionId: completed.id, clientProfileId: profileId },
    });

    // Two bookable sessions in the future — one for the blocked attempt,
    // one for the unblocked retry after the admin verifies.
    const futureAStart = new Date(nowMs + 2 * DAY_MS);
    const futureBStart = new Date(nowMs + 3 * DAY_MS);
    const sessA = await p.session.create({
      data: {
        classTypeId: reformerClassType.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: futureAStart,
        endsAt: new Date(futureAStart.getTime() + HOUR_MS),
        capacity: 6,
        status: "SCHEDULED",
      },
      select: { id: true },
    });
    const sessB = await p.session.create({
      data: {
        classTypeId: reformerClassType.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: futureBStart,
        endsAt: new Date(futureBStart.getTime() + HOUR_MS),
        capacity: 6,
        status: "SCHEDULED",
      },
      select: { id: true },
    });
    bookableSessionA = sessA.id;
    bookableSessionB = sessB.id;
  });

  test.afterAll(async () => {
    await disconnectSpec();
    await disconnect();
  });

  test("unverified minor blocked from second booking; admin verifies → unblocked", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsMinor(page);

    // Minor has a completed session AND no guardian verification → the
    // gate returns 409 GUARDIAN_VERIFICATION_REQUIRED. (First booking
    // before any completed session would be allowed; the seeded completed
    // booking trips the gate.)
    const blocked = await page.request.post("/api/bookings", {
      data: { action: "BOOK", sessionId: bookableSessionA },
    });
    expect(blocked.status()).toBe(409);
    const blockedBody = (await blocked.json()) as { error: string };
    expect(blockedBody.error).toBe("GUARDIAN_VERIFICATION_REQUIRED");

    // Admin verifies the guardian directly via prisma (faster + more
    // surgical than running the admin UI flow — that path is covered by
    // the guardian-verified.test.ts integration coverage).
    await prisma().consentRecord.updateMany({
      where: { userId: minorUserId, documentKey: "waiver_minor" },
      data: { guardianVerifiedAt: new Date() },
    });

    // Retry — same minor, now guardian-verified → 200.
    const unblocked = await page.request.post("/api/bookings", {
      data: { action: "BOOK", sessionId: bookableSessionB },
    });
    expect(unblocked.status()).toBe(200);
    const unblockedBody = (await unblocked.json()) as {
      success: boolean;
      state: string;
    };
    expect(unblockedBody.success).toBe(true);
    expect(unblockedBody.state).toBe("BOOKED");
  });
});
