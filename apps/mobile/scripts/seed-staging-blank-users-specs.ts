/**
 * The accounts seed-staging-blank-users.ts creates. Kept apart from the runner
 * so tests can import them without triggering the env preamble's process.exit.
 */
import { UserRole } from "../generated/prisma";

export type BlankUserSpec = {
  email: string;
  firstName: string;
  lastName: string;
  role: typeof UserRole.CLIENT | typeof UserRole.TRAINER;
};

// Same marker domain as the demo seed, so seed-staging-demo.ts --wipe-only
// clears these accounts along with the rest of the demo data.
export const BLANK_USER_DOMAIN = "demo.baza.rs";

export function blankUserSpecs(): BlankUserSpec[] {
  return [
    { email: `novi.demo1@${BLANK_USER_DOMAIN}`, firstName: "Novi", lastName: "Demo 1", role: UserRole.CLIENT },
    { email: `novi.demo2@${BLANK_USER_DOMAIN}`, firstName: "Novi", lastName: "Demo 2", role: UserRole.CLIENT },
    { email: `novi.demo3@${BLANK_USER_DOMAIN}`, firstName: "Novi", lastName: "Demo 3", role: UserRole.CLIENT },
    { email: `novi.trener@${BLANK_USER_DOMAIN}`, firstName: "Novi", lastName: "Trener", role: UserRole.TRAINER },
  ];
}
