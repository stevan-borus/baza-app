/**
 * Reset every local dev account to one known password.
 *
 * Accounts drift: signing in and changing a password through the app rewrites
 * the AuthAccount credential row that better-auth actually checks, so the seed
 * password stops working for that user and the seed script won't fix it (it
 * only touches accounts it creates). This resets both the User.passwordHash
 * and the credential row, so every account is usable again.
 *
 * Refuses to run against anything but a local database — this is a dev
 * convenience, and pointing it at staging would hand every real account the
 * same known password.
 *
 * Usage (from apps/mobile):
 *   pnpm reset-local-passwords            # Password123!
 *   LOCAL_PASSWORD="Other123!" pnpm reset-local-passwords
 */
import "./seed-staging-demo-env";

import { hashPassword } from "../lib/server/password";
import { prisma } from "../lib/server/prisma";

const PASSWORD = process.env.LOCAL_PASSWORD ?? "Password123!";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

async function main() {
  const { hostname, pathname } = new URL(process.env.DATABASE_URL!);
  if (!LOCAL_HOSTS.has(hostname)) {
    console.error(`Refusing to run against ${hostname} — local databases only.`);
    process.exit(1);
  }

  const hash = await hashPassword(PASSWORD);
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  await prisma.user.updateMany({ data: { passwordHash: hash } });

  let created = 0;
  for (const user of users) {
    // Composite unique is (providerId, accountId), and accountId is the email
    // better-auth signed the account up with — which is why this upserts on the
    // pair rather than on userId.
    const existing = await prisma.authAccount.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true },
    });
    if (existing) {
      await prisma.authAccount.update({ where: { id: existing.id }, data: { password: hash } });
    } else {
      await prisma.authAccount.create({
        data: { userId: user.id, providerId: "credential", accountId: user.email, password: hash },
      });
      created++;
    }
  }

  console.log(`${hostname}${pathname}: ${users.length} accounts now use "${PASSWORD}"`);
  if (created > 0) console.log(`(${created} had no credential row and got one)`);
}

main()
  .catch((e) => {
    console.error("Local password reset failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
