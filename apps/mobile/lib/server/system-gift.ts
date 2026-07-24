import type { Prisma, PrismaClient } from "@/generated/prisma";

/**
 * The built-in birthday gift PackageType. Admins never create a gift SKU: this
 * one row is ensured server-side so every environment self-heals. Its own
 * covered ClassType set is deliberately empty — the assign-sheet picker sends a
 * `classTypeIdsOverride` that defines coverage per gift, so the SKU's set is
 * irrelevant.
 *
 * The id is a fixed known string (PackageType.id is a plain String @id, so any
 * string is valid). A fixed id makes the ensure concurrency-safe: a rare
 * double-create race collapses onto the same primary key instead of minting two
 * rows. Values mirror the catalog-form defaults (lateCancelHours 8).
 */
export const SYSTEM_BIRTHDAY_GIFT_ID = "system-birthday-gift";

const SYSTEM_BIRTHDAY_GIFT = {
  name: "🎂 Rođendanski poklon",
  sessionCount: 1,
  validityDays: 30,
  lateCancelHours: 8,
  isBirthdayGift: true,
  isSystem: true,
  price: null,
} as const;

/**
 * Ensure the built-in gift row exists — read-first so the hot path (the row is
 * already present) does a single indexed lookup and NO write. Only a miss
 * triggers the upsert, and the fixed id keeps a concurrent double-create safe.
 */
export async function ensureSystemBirthdayGift(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  const existing = await db.packageType.findUnique({
    where: { id: SYSTEM_BIRTHDAY_GIFT_ID },
    select: { id: true },
  });
  if (existing) return;

  await db.packageType.upsert({
    where: { id: SYSTEM_BIRTHDAY_GIFT_ID },
    create: { id: SYSTEM_BIRTHDAY_GIFT_ID, ...SYSTEM_BIRTHDAY_GIFT },
    // No update payload: if the row was created by a racing request between the
    // read and here, leave it as-is — we only need it to exist.
    update: {},
  });
}
