import { UserRole } from "../generated/prisma";
import { hashPassword } from "../lib/server/password";
import { prisma } from "../lib/server/prisma";

const users = [
  { email: "admin@baza.rs", fullName: "Admin", role: UserRole.ADMIN },
  { email: "trainer@baza.rs", fullName: "Trainer", role: UserRole.TRAINER },
  { email: "client@baza.rs", fullName: "Client", role: UserRole.CLIENT },
];

const PASSWORD = "Steva123!";

async function main() {
  const hash = await hashPassword(PASSWORD);

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, role: u.role, isActive: true, passwordHash: hash },
      create: { email: u.email, fullName: u.fullName, role: u.role, isActive: true, passwordHash: hash },
    });

    await prisma.authAccount.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.email } },
      update: { userId: user.id, password: hash },
      create: { userId: user.id, providerId: "credential", accountId: user.email, password: hash },
    });

    if (u.role === UserRole.CLIENT) {
      await prisma.clientProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });
    }

    console.log(`Seeded ${u.role}: ${u.email}`);
  }
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
