/**
 * Test DB helper. Each integration test calls `resetDb()` in `beforeEach` to
 * truncate the tables we mutate, then seeds the rows needed for that test.
 *
 * Auth is mocked at the module boundary with `vi.mock("@/lib/server/auth-guards", ...)`
 * — see `auth-mock.ts` for the helper. We do NOT exercise better-auth in tests.
 */
import { prisma } from "@/lib/server/prisma";

export async function resetDb() {
  // Order matters — children first because of FK constraints.
  await prisma.sessionConsumption.deleteMany({});
  await prisma.trainerNote.deleteMany({});
  await prisma.waitlistEntry.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.recurringSchedule.deleteMany({});
  await prisma.packagePause.deleteMany({});
  await prisma.clientPackage.deleteMany({});
  await prisma.packageType.deleteMany({});
  await prisma.classType.deleteMany({});
  await prisma.studioRoom.deleteMany({});
  await prisma.billingRecord.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.pushToken.deleteMany({});
  await prisma.userInvite.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.authAccount.deleteMany({});
  await prisma.authSession.deleteMany({});
  await prisma.authVerification.deleteMany({});
  await prisma.clientProfile.deleteMany({});
  await prisma.trainerProfile.deleteMany({});
  await prisma.user.deleteMany({});
}
