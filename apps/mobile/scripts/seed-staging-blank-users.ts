/**
 * Staging BLANK-USER seed — three CLIENT accounts and one TRAINER account with
 * nothing attached: no packages, bookings, waitlist rows, consents, health
 * intake, notes, notifications, date of birth or phone. The emptiness is the
 * point — first login walks them through the consent gate, which is what these
 * accounts are for.
 *
 * They live on the @demo.baza.rs marker domain, so
 * `seed-staging-demo.ts --wipe-only` removes them too.
 *
 * Idempotent: re-running upserts the same four accounts.
 *
 * Usage (from apps/mobile):
 *   DATABASE_URL="<staging NON-POOLED Neon URL>" \
 *     DEMO_SEED_PASSWORD="<pw>" \
 *     pnpm exec tsx scripts/seed-staging-blank-users.ts [--dry-run]
 */

// Side-effect import: validates DATABASE_URL/TZ, defaults dummy env vars.
import "./seed-staging-demo-env";

import { UserRole } from "../generated/prisma";
import { hashPassword } from "../lib/server/password";
import { prisma } from "../lib/server/prisma";
import { blankUserSpecs } from "./seed-staging-blank-users-specs";

const DRY_RUN = process.argv.includes("--dry-run");

// Required rather than defaulted: a password baked into the file is one that
// ships to the repo and outlives whatever environment it was meant for.
function requirePassword(): string {
  const value = process.env.DEMO_SEED_PASSWORD;
  if (!value) {
    console.error(
      "DEMO_SEED_PASSWORD is required — every seeded account is created with it.\n" +
        'Example: DEMO_SEED_PASSWORD="<password>" DATABASE_URL="<non-pooled url>" pnpm exec tsx scripts/seed-staging-blank-users.ts',
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const password = requirePassword();
  const specs = blankUserSpecs();

  console.log(`Target DB host: ${new URL(process.env.DATABASE_URL!).host}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "seed"}\n`);

  if (DRY_RUN) {
    for (const spec of specs) {
      console.log(
        `would upsert ${spec.role}: ${spec.email} (${spec.firstName} ${spec.lastName})` +
          `${spec.role === UserRole.CLIENT ? " + empty ClientProfile" : ""}`,
      );
    }
    console.log("\nDry run — nothing written.");
    return;
  }

  const passwordHash = await hashPassword(password);

  for (const spec of specs) {
    const fields = {
      firstName: spec.firstName,
      lastName: spec.lastName,
      role: spec.role,
      isActive: true,
      emailVerified: true,
      passwordHash,
    };

    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: fields,
      create: { email: spec.email, ...fields },
    });

    await prisma.authAccount.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: spec.email } },
      update: { userId: user.id, password: passwordHash },
      create: { userId: user.id, providerId: "credential", accountId: spec.email, password: passwordHash },
    });

    if (spec.role === UserRole.CLIENT) {
      await prisma.clientProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });
    }

    console.log(`Seeded ${spec.role}: ${spec.email}`);
  }

  console.log(`\n${specs.length} empty accounts ready — no packages, bookings or consents attached.`);
  for (const spec of specs) console.log(`  ${spec.role.padEnd(7)} ${spec.email}`);
  console.log("Password for all of them: whatever DEMO_SEED_PASSWORD was set to for this run.");
}

main()
  .catch((e) => {
    console.error("Staging blank-user seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
