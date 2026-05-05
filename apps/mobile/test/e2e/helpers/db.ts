/**
 * Helpers for E2E specs to talk to the test DB directly.
 *
 * - `resetAndSeed()` re-applies the rich seed (Q2(b) in the test plan).
 * - `createInvite()` / `createPasswordResetToken()` insert tokens with both
 *   the raw value (returned to the spec) and the hash the API expects to
 *   match on. The production code only stores hashes, so a spec that needs
 *   to "act on" a token must create it via these helpers.
 * - `getInvite()` / `getResetToken()` read back rows for assertions.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma";

const APP_DIR = path.resolve(__dirname, "../../..");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public";

let prismaClient: PrismaClient | null = null;
let prismaPool: Pool | null = null;
function db(): PrismaClient {
  if (!prismaClient) {
    prismaPool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaPg(prismaPool);
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient;
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken() {
  return randomBytes(32).toString("hex");
}

export async function resetAndSeed() {
  execFileSync("pnpm", ["exec", "tsx", "scripts/test/seed-e2e.ts"], {
    cwd: APP_DIR,
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });
}

type CreateInviteInput = {
  email: string;
  fullName: string;
  expiresAt?: Date;
  status?: "PENDING" | "COMPLETED" | "EXPIRED" | "REVOKED";
};

/**
 * Create an invite with a known raw token. The raw token is returned so the
 * spec can put it in `/accept-invite?token=...`. Does NOT send an email.
 */
export async function createInvite(input: CreateInviteInput) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const invite = await db().userInvite.create({
    data: {
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      role: "CLIENT",
      tokenHash,
      status: input.status ?? "PENDING",
      expiresAt,
    },
  });
  return { id: invite.id, rawToken };
}

export async function getInvite(id: string) {
  return db().userInvite.findUnique({ where: { id } });
}

export async function findInviteByEmail(email: string) {
  return db().userInvite.findFirst({
    where: { email: email.toLowerCase() },
    orderBy: { createdAt: "desc" },
  });
}

type CreateResetTokenInput = {
  userEmail: string;
  expiresAt?: Date;
  usedAt?: Date | null;
};

/**
 * Create a PasswordResetToken with a known raw value.
 */
export async function createPasswordResetToken(input: CreateResetTokenInput) {
  const user = await db().user.findUnique({
    where: { email: input.userEmail.toLowerCase() },
    select: { id: true },
  });
  if (!user) {
    throw new Error(`User not found: ${input.userEmail}`);
  }
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const row = await db().passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
      usedAt: input.usedAt ?? null,
    },
  });
  return { id: row.id, rawToken };
}

/**
 * Create a Booking directly so a trainer-client linkage exists for E2E.
 * Returns the booking id and the chosen sessionId. Picks the soonest
 * future session for the trainer; throws if none.
 */
export async function linkTrainerToClient(
  trainerEmail: string,
  clientEmail: string,
) {
  const [trainer, clientUser] = await Promise.all([
    db().user.findUnique({
      where: { email: trainerEmail.toLowerCase() },
      select: { id: true },
    }),
    db().user.findUnique({
      where: { email: clientEmail.toLowerCase() },
      select: { clientProfile: { select: { id: true } } },
    }),
  ]);
  if (!trainer || !clientUser?.clientProfile) {
    throw new Error("Trainer or client not found");
  }
  const session = await db().session.findFirst({
    where: {
      trainerUserId: trainer.id,
      startsAt: { gt: new Date() },
      status: "SCHEDULED",
    },
    orderBy: { startsAt: "asc" },
    select: { id: true },
  });
  if (!session) throw new Error("No future session for trainer");
  const booking = await db().booking.upsert({
    where: {
      sessionId_clientProfileId: {
        sessionId: session.id,
        clientProfileId: clientUser.clientProfile.id,
      },
    },
    create: {
      sessionId: session.id,
      clientProfileId: clientUser.clientProfile.id,
    },
    update: { canceledAt: null },
    select: { id: true },
  });
  return { bookingId: booking.id, sessionId: session.id };
}

export async function countActiveBookingsFor(userEmail: string) {
  const user = await db().user.findUnique({
    where: { email: userEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) return 0;
  return db().booking.count({
    where: {
      clientProfileId: user.clientProfile.id,
      canceledAt: null,
    },
  });
}

export async function countTrainerNotesFor(clientEmail: string) {
  const user = await db().user.findUnique({
    where: { email: clientEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) return 0;
  return db().trainerNote.count({
    where: { clientProfileId: user.clientProfile.id },
  });
}

export async function findLatestResetTokenFor(userEmail: string) {
  const user = await db().user.findUnique({
    where: { email: userEmail.toLowerCase() },
    select: { id: true },
  });
  if (!user) return null;
  return db().passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function disconnect() {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
  if (prismaPool) {
    await prismaPool.end();
    prismaPool = null;
  }
}
