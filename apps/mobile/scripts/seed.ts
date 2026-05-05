import { UserRole } from "../generated/prisma";
import { hashPassword } from "../lib/server/password";
import { prisma } from "../lib/server/prisma";

const users = [
  { email: "admin@baza.rs", fullName: "Admin", role: UserRole.ADMIN },
  { email: "trainer@baza.rs", fullName: "Trainer", role: UserRole.TRAINER },
  { email: "client@baza.rs", fullName: "Client", role: UserRole.CLIENT },
];

const PASSWORD = "Steva123!";

const CLASS_TYPES = [
  { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  { name: "Energy pilates", maxClients: 12, durationMins: 60 },
  { name: "Moms&Minis", maxClients: 8, durationMins: 60 },
  { name: "Golden age pilates", maxClients: 10, durationMins: 60 },
] as const;

const PACKAGE_TYPES = [
  {
    name: "Reformer 12",
    sessionCount: 12,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Reformer pilates",
    priceRsd: 15000,
  },
  {
    name: "Reformer 8",
    sessionCount: 8,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Reformer pilates",
    priceRsd: 11000,
  },
  {
    name: "Energy 12",
    sessionCount: 12,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Energy pilates",
    priceRsd: 13000,
  },
  {
    name: "Moms&Minis 8",
    sessionCount: 8,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Moms&Minis",
    priceRsd: 15000,
  },
  {
    name: "Golden age 8",
    sessionCount: 8,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Golden age pilates",
    priceRsd: 11000,
  },
] as const;

async function seedUsers() {
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

async function seedClassTypesAndPackages() {
  // Order matters: ClientPackage references PackageType.
  await prisma.clientPackage.deleteMany({});
  await prisma.packageType.deleteMany({});

  const classTypeByName = new Map<string, { id: string }>();
  for (const ct of CLASS_TYPES) {
    const existing = await prisma.classType.findFirst({
      where: { name: ct.name },
      select: { id: true },
    });
    if (existing) {
      const updated = await prisma.classType.update({
        where: { id: existing.id },
        data: { maxClients: ct.maxClients, durationMins: ct.durationMins },
        select: { id: true },
      });
      classTypeByName.set(ct.name, updated);
      console.log(`Updated ClassType: ${ct.name}`);
    } else {
      const created = await prisma.classType.create({
        data: {
          name: ct.name,
          maxClients: ct.maxClients,
          durationMins: ct.durationMins,
        },
        select: { id: true },
      });
      classTypeByName.set(ct.name, created);
      console.log(`Created ClassType: ${ct.name}`);
    }
  }

  for (const pt of PACKAGE_TYPES) {
    const ct = classTypeByName.get(pt.classTypeName);
    if (!ct) {
      throw new Error(
        `Seed misconfigured: PackageType ${pt.name} references missing ClassType ${pt.classTypeName}`,
      );
    }
    await prisma.packageType.create({
      data: {
        name: pt.name,
        sessionCount: pt.sessionCount,
        validityDays: pt.validityDays,
        lateCancelHours: pt.lateCancelHours,
        classTypeId: ct.id,
      },
    });
    console.log(
      `Created PackageType: ${pt.name} (${pt.sessionCount} sessions, ${pt.priceRsd} RSD)`,
    );
  }
}

async function main() {
  await seedUsers();
  await seedClassTypesAndPackages();
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
