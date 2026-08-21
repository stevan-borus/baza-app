/**
 * Staging DEMO seed — a realistic "live studio" dataset for client walkthroughs.
 *
 * Creates (all demo users on the @demo.baza.rs marker domain, shared password):
 * - 3 trainers, 56 clients covering the full package-state matrix:
 *   active (reformer/energy/moms&minis/golden age), expired, no-package,
 *   future-start, paused, deactivated, birthday-upcoming, comp ("poklon").
 * - 12 recurring schedules per baza-landing programmes.tsx (50-min sessions),
 *   materialized 8 weeks back (COMPLETED, with attendance) + 52 weeks forward
 *   from Monday 2026-07-13.
 * - Bookings on consistent weekly patterns, full sessions with waitlists,
 *   half-full and empty sessions, cancellations (pre-cutoff + late-cancel),
 *   one bulk-canceled session, billing history ~2 months deep, consents,
 *   health intakes, trainer notes, and a few notifications.
 *
 * NEVER touches: admins or any non-demo user (e.g. miskovic.masa@gmail.com).
 * The catalog is resolved from what the admins created in-app, with three
 * user-approved exceptions: the missing "Moms&Minis" and "Golden age" class
 * types (+ a Moms&Minis package type) are created if absent, and a package
 * type whose classTypeId doesn't match its schedule's class type is repointed
 * (staging's "Golden age" package predates its class type). The only
 * pre-existing rows it removes are RecurringSchedules (+ their sessions) that
 * occupy one of the seed's own slots — i.e. the manually created 06:30
 * Reformer schedule gets replaced with the uniform 50-min version.
 *
 * Idempotent: every run wipes demo-traceable rows first, then recreates.
 *
 * Usage (from apps/mobile):
 *   DATABASE_URL="<staging NON-POOLED Neon URL>" \
 *     DEMO_SEED_PASSWORD="<shared password for every demo account>" \
 *     pnpm exec tsx scripts/seed-staging-demo.ts [--dry-run|--wipe-only]
 *
 *   --dry-run   resolve catalog + generate in memory, print the plan, write nothing
 *   --wipe-only remove all demo data (admins/catalog/masa stay) and exit
 */

// Side-effect import: validates DATABASE_URL/TZ, defaults dummy env vars.
import "./seed-staging-demo-env";

import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma";
import { NotificationType, PaymentMethod, SessionStatus, UserRole } from "../generated/prisma";
import { hashPassword } from "../lib/server/password";
import { prisma } from "../lib/server/prisma";

const DRY_RUN = process.argv.includes("--dry-run");
const WIPE_ONLY = process.argv.includes("--wipe-only");

// Shared by every demo account. Required rather than defaulted: a password
// baked into the file is one that ships to the repo and outlives whatever
// environment it was meant for, so the caller supplies it per run.
function requirePassword(): string {
  const value = process.env.DEMO_SEED_PASSWORD;
  if (!value) {
    console.error(
      "DEMO_SEED_PASSWORD is required — every demo account is created with it.\n" +
        'Example: DEMO_SEED_PASSWORD="<password>" DATABASE_URL="<non-pooled url>" pnpm exec tsx scripts/seed-staging-demo.ts',
    );
    process.exit(1);
  }
  return value;
}

const PASSWORD = requirePassword();
const DEMO_DOMAIN = "demo.baza.rs";

// Monday 13 Jul 2026, local Belgrade time — the first materialized future week.
const ANCHOR = new Date(2026, 6, 13);
const PAST_WEEKS = 8;
const FUTURE_WEEKS = 52;
const SESSION_MINS = 50;

const RUN_TIME = new Date();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Deterministic PRNG so re-runs produce the same people and patterns.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260713);
const chance = (p: number) => rand() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

// ---------------------------------------------------------------------------
// Schedule spec — exactly programmes.tsx from baza-landing (start times; all
// sessions run 50 minutes).
// ---------------------------------------------------------------------------

// The landing page's two reformer programmes share ONE class type ("Reformer
// pilates") — the 3×/week Mon/Wed/Fri and 2×/week Tue/Thu patterns below are
// just schedule slots, and "Reformer 8"/"Reformer 12" differ only as packages.
type ProgramKey = "reformer12" | "reformer8" | "energy" | "moms" | "golden";
type TrainerKey = "jelena" | "ivana" | "marko";

// weekdays: 1=Mon … 5=Fri (same convention as the app's RecurringSchedule).
const SLOTS: { program: ProgramKey; timeMins: number; weekdays: number[]; trainer: TrainerKey }[] = [
  { program: "reformer12", timeMins: 6 * 60 + 30, weekdays: [1, 3, 5], trainer: "jelena" },
  { program: "reformer12", timeMins: 7 * 60 + 30, weekdays: [1, 3, 5], trainer: "jelena" },
  { program: "reformer12", timeMins: 10 * 60, weekdays: [1, 3, 5], trainer: "jelena" },
  { program: "reformer12", timeMins: 16 * 60, weekdays: [1, 5], trainer: "ivana" },
  { program: "reformer12", timeMins: 17 * 60, weekdays: [1, 5], trainer: "ivana" },
  { program: "reformer12", timeMins: 18 * 60, weekdays: [1, 3, 5], trainer: "ivana" },
  { program: "reformer12", timeMins: 19 * 60, weekdays: [1, 3, 5], trainer: "ivana" },
  { program: "reformer12", timeMins: 20 * 60, weekdays: [3], trainer: "ivana" },
  { program: "reformer8", timeMins: 6 * 60 + 30, weekdays: [2, 4], trainer: "jelena" },
  { program: "reformer8", timeMins: 7 * 60 + 30, weekdays: [2, 4], trainer: "jelena" },
  { program: "reformer8", timeMins: 17 * 60, weekdays: [2, 4], trainer: "ivana" },
  { program: "energy", timeMins: 17 * 60, weekdays: [1, 3, 5], trainer: "marko" },
  { program: "moms", timeMins: 18 * 60, weekdays: [2, 4], trainer: "ivana" },
  { program: "moms", timeMins: 19 * 60, weekdays: [2, 4], trainer: "ivana" },
  { program: "golden", timeMins: 16 * 60, weekdays: [2, 4], trainer: "jelena" },
];

// Alternate same-day times per programme, for occasional booking-time jitter.
// Jitter must stay inside the SAME class type or the booking would violate
// the package↔class scoping rule.
const JITTER_SLOTS: Partial<Record<ProgramKey, Record<number, number[]>>> = {
  reformer12: {
    1: [390, 450, 600, 960, 1020, 1080, 1140],
    3: [390, 450, 600, 1080, 1140, 1200],
    5: [390, 450, 600, 960, 1020, 1080, 1140],
  },
  reformer8: {
    2: [390, 450, 1020],
    4: [390, 450, 1020],
  },
};

/** Local-calendar construction keeps DST transitions correct across the year. */
function dateAt(weekOffset: number, dow: number, mins: number): Date {
  const d = new Date(2026, 6, 13 + weekOffset * 7 + (dow - 1));
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const TRAINERS: { key: TrainerKey; firstName: string; lastName: string }[] = [
  { key: "jelena", firstName: "Jelena", lastName: "Marković" },
  { key: "ivana", firstName: "Ivana", lastName: "Nikolić" },
  { key: "marko", firstName: "Marko", lastName: "Petrović" },
];

const FIRST_NAMES_F = [
  "Ana", "Milica", "Jovana", "Marija", "Katarina", "Teodora", "Sara", "Nevena",
  "Tijana", "Dragana", "Snežana", "Vesna", "Gordana", "Ljiljana", "Biljana",
  "Svetlana", "Nataša", "Kristina", "Andrea", "Nina", "Lana", "Sofija", "Dunja",
  "Isidora", "Emilija", "Anđela", "Aleksandra", "Bojana", "Danica", "Jasmina",
  "Ksenija", "Lidija", "Maja", "Nada", "Olivera", "Radmila", "Sanja", "Slavica",
  "Zorana", "Verica", "Mirjana", "Tatjana", "Suzana", "Branka", "Dubravka",
  "Ivona", "Milena", "Ružica",
] as const;
const FIRST_NAMES_M = [
  "Nikola", "Stefan", "Miloš", "Luka", "Aleksandar", "Dušan", "Filip", "Nemanja",
] as const;
const LAST_NAMES = [
  "Jovanović", "Pavlović", "Stojanović", "Ilić", "Stanković", "Milošević",
  "Todorović", "Ristić", "Kostić", "Simić", "Popović", "Radovanović", "Vasić",
  "Živković", "Lazarević", "Krstić", "Savić", "Mitrović", "Obradović",
  "Filipović", "Janković", "Blagojević", "Milenković", "Vuković", "Gajić",
  "Lukić", "Cvetković", "Tomić", "Aleksić", "Radosavljević", "Matić", "Antić",
  "Đukić", "Perić", "Bogdanović", "Zarić", "Šarić", "Knežević", "Milovanović",
  "Arsić", "Tadić", "Rakić", "Urošević", "Jeremić", "Stevanović",
  "Dimitrijević", "Nedeljković", "Spasić", "Golubović", "Vučković",
  "Marjanović", "Đorđević", "Petković", "Stefanović", "Maksimović", "Pantić",
] as const;

function transliterate(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("đ", "dj")
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("š", "s")
    .replaceAll("ž", "z");
}

// ---------------------------------------------------------------------------
// Client matrix
// ---------------------------------------------------------------------------

type PackKey = "reformer12" | "reformer8" | "energy12" | "moms8" | "golden8";
type ClientKind = "active" | "expired" | "none" | "future" | "paused" | "deactivated";

const PRICES: Record<PackKey, number> = {
  reformer12: 15000,
  reformer8: 11000,
  energy12: 13000,
  moms8: 15000,
  golden8: 11000,
};

const PACK_PROGRAM: Record<PackKey, ProgramKey> = {
  reformer12: "reformer12",
  reformer8: "reformer8",
  energy12: "energy",
  moms8: "moms",
  golden8: "golden",
};

type ClientSpec = {
  idx: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dob: Date;
  isActive: boolean;
  kind: ClientKind;
  packKey: PackKey | null;
  /** Weekly booking pattern: which weekdays at which start time. */
  pattern: { days: number[]; timeMins: number } | null;
  /** Current package start, in days relative to the anchor Monday. */
  currentStartDay: number | null;
  /** Fully consumed previous package (adds ~2 months of history). */
  hasPrevPackage: boolean;
  /** How many sessions of the current package were consumed (expired kinds). */
  expiredConsumed?: number;
};

// Preferred times, index-aligned with the client lists below. Evenings are
// oversubscribed on purpose — that's what produces full sessions + waitlists.
const MWF_TIMES = [390, 390, 390, 450, 450, 450, 600, 600, 600, 1080, 1080, 1080, 1080, 1080, 1080, 1140, 1140, 1140, 1140, 1140];
const TT_TIMES = [390, 390, 390, 390, 450, 450, 450, 450, 1020, 1020, 1020, 1020, 1020, 1020];

function buildClientSpecs(): ClientSpec[] {
  const usedEmails = new Set<string>();
  const usedNames = new Set<string>();
  const specs: ClientSpec[] = [];

  const makePerson = (idx: number) => {
    // ~1 in 8 male — pilates studios skew female.
    let firstName = "";
    let lastName = "";
    do {
      firstName = idx % 8 === 7 ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
      lastName = pick(LAST_NAMES);
    } while (usedNames.has(`${firstName} ${lastName}`));
    usedNames.add(`${firstName} ${lastName}`);
    let email = `${transliterate(firstName).replace(" ", ".")}.${transliterate(lastName)}@${DEMO_DOMAIN}`;
    if (usedEmails.has(email)) email = email.replace("@", `.${idx}@`);
    usedEmails.add(email);
    const phone = chance(0.85)
      ? `+3816${Math.floor(rand() * 5) + 1}${String(Math.floor(rand() * 10_000_000)).padStart(7, "0")}`
      : null;
    return { firstName, lastName, email, phone };
  };

  const dob = (fromYear: number, toYear: number) =>
    new Date(fromYear + Math.floor(rand() * (toYear - fromYear + 1)), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));

  for (let idx = 0; idx < 56; idx++) {
    const person = makePerson(idx);
    const base: ClientSpec = {
      idx,
      ...person,
      dob: dob(1965, 2000),
      isActive: true,
      kind: "active",
      packKey: null,
      pattern: null,
      currentStartDay: null,
      hasPrevPackage: false,
    };

    if (idx <= 19) {
      // Active Reformer, 12-pack, Mon/Wed/Fri.
      base.packKey = "reformer12";
      base.pattern = { days: [1, 3, 5], timeMins: MWF_TIMES[idx]! };
      base.hasPrevPackage = idx <= 9;
      base.currentStartDay = idx <= 9 ? -21 : [-14, -7, 0][idx % 3]!;
    } else if (idx <= 33) {
      // Active Reformer, 8-pack, Tue/Thu.
      base.packKey = "reformer8";
      base.pattern = { days: [2, 4], timeMins: TT_TIMES[idx - 20]! };
      base.hasPrevPackage = idx <= 24;
      base.currentStartDay = idx <= 24 ? -21 : [-14, -7, 0][idx % 3]!;
    } else if (idx <= 38) {
      base.packKey = "energy12";
      base.pattern = { days: [1, 3, 5], timeMins: 1020 };
      base.currentStartDay = [-14, -7, 0, -14, -7][idx - 34]!;
    } else if (idx <= 43) {
      base.packKey = "moms8";
      base.pattern = { days: [2, 4], timeMins: idx - 39 < 3 ? 1080 : 1140 };
      base.currentStartDay = [-14, -7, 0, -14, -7][idx - 39]!;
      base.dob = dob(1985, 1996);
    } else if (idx <= 47) {
      base.packKey = "golden8";
      base.pattern = { days: [2, 4], timeMins: 960 };
      base.currentStartDay = [-14, -7, 0, -14][idx - 44]!;
      base.dob = dob(1952, 1962);
    } else if (idx <= 50) {
      // Expired packages: 5–30 days before the anchor; one with unused sessions.
      base.kind = "expired";
      if (idx === 48) {
        base.packKey = "reformer12";
        base.pattern = { days: [1, 3, 5], timeMins: 1080 };
        base.currentStartDay = -49;
        base.expiredConsumed = 8; // 4 unused sessions lost to expiry
      } else {
        base.packKey = "reformer8";
        base.pattern = { days: [2, 4], timeMins: idx === 49 ? 450 : 1020 };
        base.currentStartDay = idx === 49 ? -42 : -35;
        base.expiredConsumed = 8;
      }
    } else if (idx <= 52) {
      base.kind = "none";
    } else if (idx === 53) {
      // Paid, starts next week.
      base.kind = "future";
      base.packKey = "reformer12";
      base.pattern = { days: [1, 3, 5], timeMins: 600 };
      base.currentStartDay = 7;
    } else if (idx === 54) {
      base.kind = "paused";
      base.packKey = "reformer12";
      base.pattern = { days: [1, 3, 5], timeMins: 450 };
      base.currentStartDay = -14;
    } else {
      // Soft-deleted client with fully consumed history.
      base.kind = "deactivated";
      base.isActive = false;
      base.packKey = "reformer8";
      base.pattern = { days: [2, 4], timeMins: 390 };
      base.currentStartDay = -56;
      base.expiredConsumed = 8;
    }
    specs.push(base);
  }

  // One active client with a birthday right after launch day.
  specs[2]!.dob = new Date(1990, 6, 15);

  return specs;
}

// ---------------------------------------------------------------------------
// Catalog resolution — runtime lookup, abort loudly on any mismatch.
// ---------------------------------------------------------------------------

type CatalogClassType = { id: string; name: string; maxClients: number };
type CatalogPackageType = {
  id: string;
  name: string;
  sessionCount: number;
  validityDays: number;
  lateCancelHours: number;
  classTypeId: string;
};

type Catalog = {
  classTypes: Record<ProgramKey, CatalogClassType>;
  rooms: Record<"reformer" | "energy", { id: string; name: string; capacity: number }>;
  packageTypes: Record<PackKey, CatalogPackageType>;
  notices: string[];
};

async function resolveCatalog(): Promise<Catalog> {
  const [classTypes, rooms, packageTypes] = await Promise.all([
    prisma.classType.findMany(),
    prisma.studioRoom.findMany(),
    prisma.packageType.findMany({
      where: { isBirthdayGift: false },
      include: { classTypes: { select: { classTypeId: true } } },
    }),
  ]);
  const notices: string[] = [];

  const dump = () => {
    console.error("\n--- Catalog dump ---");
    console.error("ClassTypes:", classTypes.map((c) => `${c.name} (max ${c.maxClients})`).join(", "));
    console.error("Rooms:", rooms.map((r) => `${r.name} (cap ${r.capacity})`).join(", "));
    console.error("PackageTypes:", packageTypes.map((p) => `${p.name} (${p.sessionCount}x, ${p.validityDays}d)`).join(", "));
  };
  const fail = (msg: string): never => {
    dump();
    throw new Error(`Catalog resolution failed: ${msg}`);
  };

  const findClassType = (label: string, pred: (name: string) => boolean): CatalogClassType | null => {
    const matches = classTypes.filter((c) => pred(c.name));
    if (matches.length > 1) fail(`multiple ClassTypes match "${label}": ${matches.map((m) => m.name).join(", ")}`);
    return matches[0] ?? null;
  };
  const requireClassType = (label: string, pred: (name: string) => boolean): CatalogClassType =>
    findClassType(label, pred) ?? fail(`no ClassType matching "${label}"`);
  /** Moms&Minis / Golden age were never created in the staging admin UI — the seed adds them. */
  const ensureClassType = async (label: string, name: string, pred: (n: string) => boolean): Promise<CatalogClassType> => {
    const existing = findClassType(label, pred);
    if (existing) return existing;
    notices.push(`creating missing ClassType "${name}" (max 6, 50min)`);
    if (DRY_RUN) return { id: `would-create:${label}`, name: `${name} (would create)`, maxClients: 6 };
    return prisma.classType.create({ data: { name, maxClients: 6, durationMins: 50 } });
  };

  // ONE reformer class type — "Reformer 8" vs "Reformer 12" differ only as
  // PackageTypes (session count/price). Splitting them into two ClassTypes
  // fenced Reformer-8 clients to Tue/Thu (the class-scoping rule hides other
  // class types' sessions), which surfaced as a pilot bug report.
  const reformer = requireClassType("reformer", (n) => /reformer/i.test(n));
  const ct: Record<ProgramKey, CatalogClassType> = {
    reformer12: reformer,
    reformer8: reformer,
    energy: requireClassType("energy", (n) => /energy/i.test(n)),
    moms: await ensureClassType("moms&minis", "Moms&Minis", (n) => /mom|mini/i.test(n)),
    golden: await ensureClassType("golden age", "Golden age pilates", (n) => /golden|zlat/i.test(n)),
  };

  const energyRooms = rooms.filter((r) => /energy/i.test(r.name));
  if (energyRooms.length !== 1) fail(`expected exactly 1 room named like "energy", found ${energyRooms.length}`);
  const energyRoom = energyRooms[0]!;
  // Reformer sessions go ONLY into the capacity-6 room (never the 4- or 2-seat salas).
  const reformerRooms = rooms.filter((r) => r.capacity === 6 && r.id !== energyRoom.id);
  if (reformerRooms.length !== 1) fail(`expected exactly 1 non-energy room with capacity 6, found ${reformerRooms.length}`);
  const reformerRoom = reformerRooms[0]!;

  // Package types matched by NAME + size: staging also has "Reformer Duo" /
  // "Reformer Personal" (their rooms/class types are excluded from the demo),
  // so a bare classTypeId+size match would be ambiguous.
  const toCatalogPackage = (p: (typeof packageTypes)[number]): CatalogPackageType => ({
    id: p.id,
    name: p.name,
    sessionCount: p.sessionCount,
    validityDays: p.validityDays,
    lateCancelHours: p.lateCancelHours,
    // The demo's packages are single-program by construction. A mix package
    // (ADR-0010 lets a PackageType cover a SET) has no place in the matrix
    // below, so it's an abort rather than a silent first-link pick.
    classTypeId:
      p.classTypes.length === 1
        ? p.classTypes[0]!.classTypeId
        : fail(`PackageType "${p.name}" covers ${p.classTypes.length} class types; the demo expects exactly 1`),
  });
  const findPackage = (label: string, pred: (p: (typeof packageTypes)[number]) => boolean): CatalogPackageType | null => {
    const matches = packageTypes.filter(pred);
    if (matches.length > 1) fail(`multiple PackageTypes match "${label}": ${matches.map((m) => m.name).join(", ")}`);
    return matches[0] ? toCatalogPackage(matches[0]) : null;
  };
  const requirePackage = (label: string, pred: (p: (typeof packageTypes)[number]) => boolean): CatalogPackageType =>
    findPackage(label, pred) ?? fail(`no PackageType matching "${label}"`);
  const notDuoPersonal = (n: string) => !/duo|personal/i.test(n);

  const pt: Record<PackKey, CatalogPackageType> = {
    reformer12: requirePackage("Reformer 12", (p) => /reformer/i.test(p.name) && notDuoPersonal(p.name) && p.sessionCount === 12),
    reformer8: requirePackage("Reformer 8", (p) => /reformer/i.test(p.name) && notDuoPersonal(p.name) && p.sessionCount === 8),
    energy12: requirePackage("Energy 12", (p) => /energy/i.test(p.name) && p.sessionCount === 12),
    moms8: findPackage("Moms&Minis 8", (p) => /mom|mini/i.test(p.name) && p.sessionCount === 8) ?? {
      id: "pending:moms8",
      name: "Moms&Minis 8",
      sessionCount: 8,
      validityDays: 31,
      lateCancelHours: 8,
      classTypeId: ct.moms.id,
    },
    golden8: requirePackage("Golden age 8", (p) => /golden|zlat/i.test(p.name) && p.sessionCount === 8),
  };
  if (pt.moms8.id === "pending:moms8") {
    notices.push(`creating missing PackageType "Moms&Minis 8" (8x / 31d) on "${ct.moms.name}"`);
    if (!DRY_RUN) {
      const created = await prisma.packageType.create({
        data: {
          name: "Moms&Minis 8",
          sessionCount: 8,
          validityDays: 31,
          lateCancelHours: 8,
          classTypes: { create: { classTypeId: ct.moms.id } },
        },
        include: { classTypes: { select: { classTypeId: true } } },
      });
      pt.moms8 = toCatalogPackage(created);
    }
  }

  // A package must point at the class type its sessions use, or bookings made
  // with it can't target the schedule (staging's "Golden age" package predates
  // the Golden age class type and points elsewhere).
  for (const key of Object.keys(pt) as PackKey[]) {
    const expected = ct[PACK_PROGRAM[key]];
    const pkg = pt[key];
    if (pkg.classTypeId === expected.id) continue;
    notices.push(
      `${DRY_RUN ? "would repoint" : "repointing"} PackageType "${pkg.name}" → ClassType "${expected.name}" (was ${pkg.classTypeId})`,
    );
    if (!DRY_RUN && !pkg.id.startsWith("pending:")) {
      await prisma.packageType.update({
        where: { id: pkg.id },
        data: { classTypes: { deleteMany: {}, create: { classTypeId: expected.id } } },
      });
    }
    pkg.classTypeId = expected.id;
  }

  return { classTypes: ct, rooms: { reformer: reformerRoom, energy: energyRoom }, packageTypes: pt, notices };
}

// ---------------------------------------------------------------------------
// Cleanup — removes ONLY demo-traceable rows + slot-colliding schedules.
// ---------------------------------------------------------------------------

async function cleanup(catalog: Catalog) {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, role: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);
  const demoTrainerIds = demoUsers.filter((u) => u.role === UserRole.TRAINER).map((u) => u.id);

  const slotFilters = SLOTS.map((s) => ({
    classTypeId: catalog.classTypes[s.program].id,
    timeOfDayMins: s.timeMins,
  }));
  const colliding = await prisma.recurringSchedule.findMany({
    where: { OR: slotFilters, trainerUserId: { notIn: demoTrainerIds } },
    select: { id: true, timeOfDayMins: true, weekdays: true },
  });
  const collidingIds = colliding.map((c) => c.id);

  const affectedNonDemoBookings = collidingIds.length
    ? await prisma.booking.count({
        where: {
          session: { recurringScheduleId: { in: collidingIds } },
          clientProfile: { user: { email: { not: { endsWith: `@${DEMO_DOMAIN}` } } } },
        },
      })
    : 0;

  console.log(
    `Cleanup: ${demoUsers.length} demo users, ${colliding.length} pre-existing slot-colliding schedule(s)` +
      (colliding.length
        ? ` [${colliding.map((c) => `${Math.floor(c.timeOfDayMins / 60)}:${String(c.timeOfDayMins % 60).padStart(2, "0")} on ${c.weekdays.join(",")}]`).join(" ")}`
        : "") +
      `, ${affectedNonDemoBookings} non-demo booking(s) on replaced sessions`,
  );

  // Pre-existing one-off sessions in the demo rooms (no colliding schedule)
  // are NOT removed — surface them so duplicate calendar slots don't surprise.
  const straySessions = await prisma.session.count({
    where: {
      startsAt: { gte: RUN_TIME },
      roomId: { in: [catalog.rooms.reformer.id, catalog.rooms.energy.id] },
      trainerUserId: { notIn: demoTrainerIds },
      OR: [{ recurringScheduleId: null }, { recurringScheduleId: { notIn: collidingIds } }],
    },
  });
  if (straySessions > 0) {
    console.log(
      `NOTE: ${straySessions} pre-existing future session(s) in the demo rooms are left untouched and may overlap seeded slots.`,
    );
  }

  if (DRY_RUN) return;

  await prisma.billingRecord.deleteMany({ where: { clientUserId: { in: demoUserIds } } });
  await prisma.session.deleteMany({
    where: {
      OR: [{ trainerUserId: { in: demoTrainerIds } }, { recurringScheduleId: { in: collidingIds } }],
    },
  });
  await prisma.recurringSchedule.deleteMany({
    where: { OR: [{ trainerUserId: { in: demoTrainerIds } }, { id: { in: collidingIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });
}

// ---------------------------------------------------------------------------
// In-memory generation
// ---------------------------------------------------------------------------

type MemSession = {
  id: string;
  program: ProgramKey;
  week: number;
  dow: number;
  timeMins: number;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  status: SessionStatus;
  scheduleId: string;
  trainerUserId: string;
  roomId: string;
  booked: number;
  bookedClientIds: Set<string>;
  waitlistCount: number;
};

type MemBooking = {
  sessionId: string;
  clientProfileId: string;
  clientPackageId: string | null;
  createdAt: Date;
  canceledAt: Date | null;
  consumed: boolean;
  startsAt: Date;
  clientIdx: number;
  session: MemSession;
};

type MemPackage = {
  id: string;
  clientIdx: number;
  clientProfileId: string;
  packKey: PackKey;
  startsAt: Date;
  expiresAt: Date;
  consumed: number;
  futureBooked: number;
  // A future waitlist seat also RESERVES a session under the runtime hold model
  // (countHeldSessions counts waitlist entries), so it must draw down the same
  // budget as a booking — otherwise the seed hands a client `credits` bookings
  // PLUS a waitlist seat, and the runtime's held count exceeds their credits,
  // pinning bookable at 0. Tracked per package the pattern was walking for.
  futureWaitlisted: number;
  paid: boolean;
  isPrev: boolean;
};

function generate(catalog: Catalog, passwordHash: string) {
  const clientSpecs = buildClientSpecs();

  // --- users ---
  const trainerIds: Record<TrainerKey, string> = { jelena: "", ivana: "", marko: "" };
  const users: Prisma.UserCreateManyInput[] = [];
  const profiles: Prisma.ClientProfileCreateManyInput[] = [];
  const authAccounts: Prisma.AuthAccountCreateManyInput[] = [];

  for (const t of TRAINERS) {
    const id = randomUUID();
    trainerIds[t.key] = id;
    const email = `${transliterate(t.firstName)}.${transliterate(t.lastName)}@${DEMO_DOMAIN}`;
    users.push({
      id,
      email,
      firstName: t.firstName,
      lastName: t.lastName,
      role: UserRole.TRAINER,
      isActive: true,
      emailVerified: true,
      passwordHash,
      createdAt: new Date(ANCHOR.getTime() - 60 * DAY_MS),
    });
    authAccounts.push({ userId: id, providerId: "credential", accountId: email, password: passwordHash });
  }

  const clientState = clientSpecs.map((spec) => {
    const userId = randomUUID();
    const clientProfileId = randomUUID();
    const firstStartDay = spec.hasPrevPackage ? -56 : (spec.currentStartDay ?? -30);
    const joinedAt = new Date(Math.min(ANCHOR.getTime() + firstStartDay * DAY_MS - 2 * DAY_MS, RUN_TIME.getTime() - 3 * DAY_MS));
    users.push({
      id: userId,
      email: spec.email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      phone: spec.phone,
      role: UserRole.CLIENT,
      isActive: spec.isActive,
      emailVerified: true,
      passwordHash,
      createdAt: joinedAt,
    });
    profiles.push({ id: clientProfileId, userId, dateOfBirth: spec.dob, createdAt: joinedAt });
    authAccounts.push({ userId, providerId: "credential", accountId: spec.email, password: passwordHash });
    return { spec, userId, clientProfileId, joinedAt };
  });

  // --- recurring schedules + sessions ---
  const schedules: Prisma.RecurringScheduleCreateManyInput[] = [];
  const sessions: MemSession[] = [];
  const sessionAt = new Map<string, MemSession>();
  const skey = (program: ProgramKey, week: number, dow: number, timeMins: number) => `${program}|${week}|${dow}|${timeMins}`;

  // One past session gets bulk-canceled (Wed 10:00, the week before launch).
  const canceledSlot = skey("reformer12", -1, 3, 600);

  for (const slot of SLOTS) {
    const scheduleId = randomUUID();
    const room = slot.program === "energy" ? catalog.rooms.energy : catalog.rooms.reformer;
    const capacity = Math.min(catalog.classTypes[slot.program].maxClients, room.capacity);
    schedules.push({
      id: scheduleId,
      classTypeId: catalog.classTypes[slot.program].id,
      roomId: room.id,
      trainerUserId: trainerIds[slot.trainer],
      weekdays: slot.weekdays,
      timeOfDayMins: slot.timeMins,
      durationMins: SESSION_MINS,
      capacity,
      isActive: true,
    });
    for (let week = -PAST_WEEKS; week < FUTURE_WEEKS; week++) {
      for (const dow of slot.weekdays) {
        const startsAt = dateAt(week, dow, slot.timeMins);
        const endsAt = new Date(startsAt.getTime() + SESSION_MINS * 60 * 1000);
        const key = skey(slot.program, week, dow, slot.timeMins);
        const status =
          key === canceledSlot
            ? SessionStatus.CANCELED
            : startsAt.getTime() < RUN_TIME.getTime()
              ? SessionStatus.COMPLETED
              : SessionStatus.SCHEDULED;
        const mem: MemSession = {
          id: randomUUID(),
          program: slot.program,
          week,
          dow,
          timeMins: slot.timeMins,
          startsAt,
          endsAt,
          capacity,
          status,
          scheduleId,
          trainerUserId: trainerIds[slot.trainer],
          roomId: room.id,
          booked: 0,
          bookedClientIds: new Set(),
          waitlistCount: 0,
        };
        sessions.push(mem);
        sessionAt.set(key, mem);
      }
    }
  }

  // --- packages + bookings + waitlist ---
  const packages: MemPackage[] = [];
  const bookings: MemBooking[] = [];
  const waitlist: Prisma.WaitlistEntryCreateManyInput[] = [];
  const pauses: Prisma.PackagePauseCreateManyInput[] = [];

  const addPackage = (clientIdx: number, packKey: PackKey, startDay: number, opts: { paid?: boolean; isPrev?: boolean } = {}): MemPackage => {
    const state = clientState[clientIdx]!;
    const pt = catalog.packageTypes[packKey];
    const startsAt = new Date(ANCHOR.getTime() + startDay * DAY_MS);
    const pkg: MemPackage = {
      id: randomUUID(),
      clientIdx,
      clientProfileId: state.clientProfileId,
      packKey,
      startsAt,
      expiresAt: new Date(startsAt.getTime() + pt.validityDays * DAY_MS),
      consumed: 0,
      futureBooked: 0,
      futureWaitlisted: 0,
      paid: opts.paid ?? true,
      isPrev: opts.isPrev ?? false,
    };
    packages.push(pkg);
    return pkg;
  };

  const book = (pkg: MemPackage, session: MemSession, opts: { forceConsume?: boolean } = {}): MemBooking | null => {
    const state = clientState[pkg.clientIdx]!;
    if (session.bookedClientIds.has(state.clientProfileId)) return null;
    if (session.booked >= session.capacity) return null;
    const isPast = session.startsAt.getTime() < RUN_TIME.getTime();
    const isCanceledSession = session.status === SessionStatus.CANCELED;
    // Attended (consumed) unless it's the bulk-canceled session or a rare no-show.
    const consumed = !isCanceledSession && isPast && (opts.forceConsume || chance(0.92));
    const booking: MemBooking = {
      sessionId: session.id,
      clientProfileId: state.clientProfileId,
      clientPackageId: pkg.id,
      createdAt: new Date(Math.min(session.startsAt.getTime() - (2 + rand() * 4) * DAY_MS, RUN_TIME.getTime() - HOUR_MS)),
      canceledAt: isCanceledSession ? new Date(session.startsAt.getTime() - 2 * DAY_MS) : null,
      consumed,
      startsAt: session.startsAt,
      clientIdx: pkg.clientIdx,
      session,
    };
    bookings.push(booking);
    session.bookedClientIds.add(state.clientProfileId);
    if (!booking.canceledAt) {
      session.booked++;
      if (consumed) pkg.consumed++;
      else if (!isPast) pkg.futureBooked++;
    }
    return booking;
  };

  const packSize = (k: PackKey) => catalog.packageTypes[k].sessionCount;
  // Generation budget = credits minus everything the runtime treats as a hold:
  // consumed sessions, future bookings, AND future waitlist seats. Keeps the
  // seed from over-committing a package past what `bookable` can ever show.
  const remaining = (pkg: MemPackage) =>
    packSize(pkg.packKey) - pkg.consumed - pkg.futureBooked - pkg.futureWaitlisted;

  // Future waitlist seats a client already holds for a class type. The runtime
  // counts a waitlist seat as a hold against EVERY same-class package (it has
  // no package FK), so budgeting it per-package undercounts when a client owns
  // two same-class packs (e.g. an expired + an active one). We gate new seats
  // on the client's aggregate class-type headroom instead.
  const classWaitlistByClient = new Map<string, number>();
  const classKey = (clientProfileId: string, program: ProgramKey) =>
    `${clientProfileId}::${program}`;
  // Bookable credits the client has across ALL their same-class packages, minus
  // the waitlist seats they already hold for that class. A new waitlist seat is
  // only safe while this stays positive — otherwise the seat would push held
  // above credits on the active pack and pin bookable at 0.
  const classHeadroom = (clientProfileId: string, program: ProgramKey) => {
    const credits = packages
      .filter(
        (p) =>
          p.clientProfileId === clientProfileId &&
          PACK_PROGRAM[p.packKey] === program,
      )
      .reduce(
        (sum, p) => sum + Math.max(0, packSize(p.packKey) - p.consumed - p.futureBooked),
        0,
      );
    return credits - (classWaitlistByClient.get(classKey(clientProfileId, program)) ?? 0);
  };

  /** Walk the client's weekly pattern inside the package window, booking sessions. */
  const runPattern = (
    pkg: MemPackage,
    pattern: { days: number[]; timeMins: number },
    opts: { maxConsumed?: number; futureHorizonWeek?: number; fullAttendance?: boolean },
  ) => {
    // Leave real bookable headroom on active packages: cap FUTURE holds
    // (bookings + waitlist seats) at ~60% of the credits left after attendance,
    // so `bookable` stays positive out of the box and canceling a session
    // visibly frees a slot. Past attendance is unaffected — it uses full budget.
    // `fullAttendance` packs (prev/expired history) book their whole pattern.
    const creditsAfterConsumed = () =>
      Math.max(0, packSize(pkg.packKey) - pkg.consumed);
    const futureHoldCap = () =>
      opts.fullAttendance ? Infinity : Math.ceil(creditsAfterConsumed() * 0.6);
    const atFutureHoldCap = () =>
      pkg.futureBooked + pkg.futureWaitlisted >= futureHoldCap();

    for (let week = -PAST_WEEKS; week < FUTURE_WEEKS; week++) {
      for (const dow of pattern.days) {
        if (remaining(pkg) <= 0) return;
        if (opts.maxConsumed !== undefined && pkg.consumed >= opts.maxConsumed) return;
        // Occasional time jitter within the same day and class type.
        let timeMins = pattern.timeMins;
        const program = PACK_PROGRAM[pkg.packKey];
        const jitterSlots = JITTER_SLOTS[program]?.[dow];
        if (jitterSlots && chance(0.12)) timeMins = pick(jitterSlots);
        const session = sessionAt.get(skey(program, week, dow, timeMins));
        if (!session) continue;
        if (session.startsAt.getTime() < pkg.startsAt.getTime()) continue;
        if (session.startsAt.getTime() > pkg.expiresAt.getTime()) continue;
        const isPast = session.startsAt.getTime() < RUN_TIME.getTime();
        if (!isPast && opts.futureHorizonWeek !== undefined && week > opts.futureHorizonWeek) return;
        // Stop taking future holds once this package has reserved its headroom
        // cap, leaving bookable > 0. Past attendance keeps filling below.
        if (!isPast && atFutureHoldCap()) continue;
        // Realistic gaps: not every pattern slot is kept.
        if (isPast && !opts.fullAttendance && chance(0.12)) continue;
        if (session.booked >= session.capacity) {
          // Preferred slot full → sometimes join the waitlist (upcoming only).
          // Only when the client can still AFFORD the seat across all their
          // same-class packs — a waitlist seat reserves a session at runtime.
          if (
            !isPast &&
            session.waitlistCount < 3 &&
            chance(0.5) &&
            !session.bookedClientIds.has(pkg.clientProfileId) &&
            classHeadroom(pkg.clientProfileId, program) > 0
          ) {
            session.waitlistCount++;
            pkg.futureWaitlisted++;
            classWaitlistByClient.set(
              classKey(pkg.clientProfileId, program),
              (classWaitlistByClient.get(classKey(pkg.clientProfileId, program)) ?? 0) + 1,
            );
            waitlist.push({
              sessionId: session.id,
              clientProfileId: pkg.clientProfileId,
              position: session.waitlistCount,
              createdAt: new Date(Math.min(session.startsAt.getTime() - 1 * DAY_MS, RUN_TIME.getTime() - HOUR_MS)),
            });
          }
          continue;
        }
        book(pkg, session, { forceConsume: opts.fullAttendance });
      }
    }
  };

  const currentWeek = Math.max(0, Math.ceil((RUN_TIME.getTime() - ANCHOR.getTime()) / (7 * DAY_MS)));

  for (const { spec } of clientState) {
    if (!spec.packKey || !spec.pattern) continue;

    // Fully consumed previous package → attendance + payment history.
    if (spec.hasPrevPackage) {
      const prev = addPackage(spec.idx, spec.packKey, -56, { isPrev: true });
      runPattern(prev, spec.pattern, { fullAttendance: true });
    }

    const current = addPackage(spec.idx, spec.packKey, spec.currentStartDay!, {
      paid: !(spec.idx === 15 || spec.idx === 44), // two comp ("poklon") packages
    });

    if (spec.kind === "expired" || spec.kind === "deactivated") {
      runPattern(current, spec.pattern, { maxConsumed: spec.expiredConsumed, fullAttendance: true });
      continue;
    }
    if (spec.kind === "paused") {
      // Attended before the pause; nothing upcoming while paused.
      runPattern(current, spec.pattern, { futureHorizonWeek: -1 });
      pauses.push({
        clientProfileId: clientState[spec.idx]!.clientProfileId,
        startsAt: new Date(ANCHOR.getTime() - 2 * DAY_MS),
        endsAt: new Date(ANCHOR.getTime() + 12 * DAY_MS),
        reason: "Godišnji odmor",
      });
      continue;
    }
    // Active + future-start: book up to ~3 weeks out (a few eager ones book 4).
    runPattern(current, spec.pattern, { futureHorizonWeek: currentWeek + (spec.idx < 5 ? 3 : 2) });
  }

  // --- guarantee 3 exactly-full prime-time sessions with waitlists ---
  const fullTargets = [
    sessionAt.get(skey("reformer12", currentWeek, 1, 1080))!,
    sessionAt.get(skey("reformer12", currentWeek, 3, 1140))!,
    sessionAt.get(skey("reformer12", currentWeek, 5, 1020))!,
  ];
  // Only reformer12 packages may fill/wait on reformer12 sessions — package↔class scoping.
  const reformerActives = packages.filter(
    (p) => !p.isPrev && PACK_PROGRAM[p.packKey] === "reformer12" && clientState[p.clientIdx]!.spec.kind === "active",
  );
  for (const target of fullTargets) {
    for (const pkg of reformerActives) {
      if (target.booked >= target.capacity) break;
      if (remaining(pkg) <= 0) continue;
      if (target.startsAt.getTime() < pkg.startsAt.getTime() || target.startsAt.getTime() > pkg.expiresAt.getTime()) continue;
      book(pkg, target);
    }
    let extraWaits = 2 + (chance(0.5) ? 1 : 0);
    for (const pkg of reformerActives) {
      if (extraWaits <= 0) break;
      if (target.bookedClientIds.has(pkg.clientProfileId)) continue;
      if (waitlist.some((w) => w.sessionId === target.id && w.clientProfileId === pkg.clientProfileId)) continue;
      target.waitlistCount++;
      waitlist.push({
        sessionId: target.id,
        clientProfileId: pkg.clientProfileId,
        position: target.waitlistCount,
        createdAt: new Date(RUN_TIME.getTime() - (1 + rand() * 24) * HOUR_MS),
      });
      extraWaits--;
    }
  }

  // --- cancellations ---
  // 3 pre-cutoff cancels on upcoming bookings: seat freed, session refunded.
  // Never cancel out of a waitlisted/full session — a freed seat there would
  // break the "waitlist only exists on full sessions" product rule.
  const upcomingBookings = bookings.filter(
    (b) =>
      !b.canceledAt &&
      b.startsAt.getTime() > RUN_TIME.getTime() + 3 * DAY_MS &&
      b.session.waitlistCount === 0 &&
      !fullTargets.some((t) => t.id === b.sessionId),
  );
  for (let i = 0; i < 3 && i * 7 < upcomingBookings.length; i++) {
    const b = upcomingBookings[i * 7]!;
    b.canceledAt = new Date(RUN_TIME.getTime() - (2 + i * 5) * HOUR_MS);
    b.session.booked--;
    b.session.bookedClientIds.delete(b.clientProfileId);
    const pkg = packages.find((p) => p.id === b.clientPackageId)!;
    pkg.futureBooked--;
  }
  // 3 late cancels on past bookings: canceled inside the window, session still charged.
  const pastConsumed = bookings.filter((b) => !b.canceledAt && b.consumed && b.session.week >= -2 && b.session.week <= -1);
  for (let i = 0; i < 3 && i * 5 < pastConsumed.length; i++) {
    const b = pastConsumed[i * 5]!;
    b.canceledAt = new Date(b.startsAt.getTime() - 2 * HOUR_MS);
  }

  // --- billing ---
  const methodCycle = [
    PaymentMethod.CARD,
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.CASH,
    PaymentMethod.COMPANY,
    PaymentMethod.CARD,
    PaymentMethod.CASH,
    PaymentMethod.MANUAL_ONLINE,
  ];
  let methodIdx = 0;
  const billing: Prisma.BillingRecordCreateManyInput[] = [];
  for (const pkg of packages) {
    if (!pkg.paid) continue;
    const method = methodCycle[methodIdx++ % methodCycle.length]!;
    billing.push({
      clientUserId: clientState[pkg.clientIdx]!.userId,
      amount: PRICES[pkg.packKey],
      method,
      status: "CONFIRMED",
      packageTypeId: catalog.packageTypes[pkg.packKey].id,
      clientPackageId: pkg.id,
      notes: method === PaymentMethod.COMPANY ? "Uplata preko firme" : null,
      createdAt: new Date(Math.min(pkg.startsAt.getTime() - 1 * DAY_MS, RUN_TIME.getTime() - HOUR_MS)),
    });
  }

  // --- consents (nobody hits the consent gate during the demo) ---
  const consents: Prisma.ConsentRecordCreateManyInput[] = [];
  const staffKeys = ["tos", "privacy", "eula"] as const;
  const clientKeys = ["tos", "privacy", "eula", "waiver_adult"] as const;
  for (const t of TRAINERS) {
    for (const documentKey of staffKeys) {
      consents.push({
        userId: trainerIds[t.key],
        documentKey,
        version: 1,
        locale: "sr",
        accepted: true,
        acceptedAt: new Date(ANCHOR.getTime() - 60 * DAY_MS),
      });
    }
  }
  for (const state of clientState) {
    for (const documentKey of clientKeys) {
      consents.push({
        userId: state.userId,
        documentKey,
        version: 1,
        locale: "sr",
        accepted: true,
        acceptedAt: state.joinedAt,
      });
    }
  }

  // --- health intakes (10 varied) ---
  const intakeSamples: Array<Partial<Prisma.ClientHealthIntakeCreateManyInput>> = [
    { conditions: ["back_pain"], pilatesExperience: ["mat"], activityLevel: "moderate", exerciseFrequency: "2-3", goals: ["core_strength", "improve_posture"], discomfortDuring: ["sitting"] },
    { conditions: [], pilatesExperience: ["none"], activityLevel: "sedentary", exerciseFrequency: "0-1", goals: ["stress_reduction", "movement_quality"], discomfortDuring: [] },
    { conditions: ["neck_pain", "scoliosis"], pilatesExperience: ["reformer"], pilatesExperienceDuration: "2 godine", activityLevel: "moderate", exerciseFrequency: "2-3", goals: ["reduce_pain", "improve_posture"], discomfortDuring: ["sitting", "rotation"] },
    { conditions: ["disc_herniation"], underMedicalTreatment: true, medicalTreatmentDetails: "Fizikalna terapija, L4-L5", pilatesExperience: ["clinical"], activityLevel: "sedentary", exerciseFrequency: "0-1", goals: ["rehabilitation", "reduce_pain"], discomfortDuring: ["bending", "sitting"] },
    { conditions: [], pilatesExperience: ["mat", "reformer"], pilatesExperienceDuration: "5 godina", activityLevel: "high", exerciseFrequency: "4+", goals: ["core_strength", "increase_flexibility"], discomfortDuring: [] },
    { conditions: ["pregnancy_postpartum"], pilatesExperience: ["mat"], activityLevel: "moderate", exerciseFrequency: "2-3", goals: ["core_strength", "movement_quality"], discomfortDuring: ["standing"] },
    { conditions: ["osteoporosis", "joint_pain_injuries"], underMedicalTreatment: true, medicalTreatmentDetails: "Redovna kontrola kod reumatologa", pilatesExperience: ["none"], activityLevel: "sedentary", exerciseFrequency: "0-1", goals: ["reduce_pain", "movement_quality"], discomfortDuring: ["walking", "balance"] },
    { conditions: ["high_blood_pressure"], pilatesExperience: ["none"], activityLevel: "moderate", exerciseFrequency: "2-3", goals: ["stress_reduction"], discomfortDuring: [] },
    { conditions: ["recent_surgery"], underMedicalTreatment: true, medicalTreatmentDetails: "Artroskopija kolena pre 4 meseca", pilatesExperience: ["mat"], activityLevel: "moderate", exerciseFrequency: "2-3", goals: ["rehabilitation"], discomfortDuring: ["balance"] },
    { conditions: [], pilatesExperience: ["reformer"], pilatesExperienceDuration: "1 godina", activityLevel: "high", exerciseFrequency: "4+", goals: ["core_strength", "improve_posture", "increase_flexibility"], discomfortDuring: [] },
  ];
  const intakeClientIdxs = [0, 2, 5, 20, 34, 39, 44, 46, 48, 51];
  const intakes: Prisma.ClientHealthIntakeCreateManyInput[] = intakeClientIdxs.map((clientIdx, i) => {
    const state = clientState[clientIdx]!;
    const sample = intakeSamples[i]!;
    return {
      clientProfileId: state.clientProfileId,
      conditions: sample.conditions ?? [],
      underMedicalTreatment: sample.underMedicalTreatment ?? false,
      medicalTreatmentDetails: sample.medicalTreatmentDetails ?? null,
      pilatesExperience: sample.pilatesExperience ?? ["none"],
      pilatesExperienceDuration: sample.pilatesExperienceDuration ?? null,
      activityLevel: sample.activityLevel ?? "moderate",
      exerciseFrequency: sample.exerciseFrequency ?? "2-3",
      goals: sample.goals ?? [],
      discomfortDuring: sample.discomfortDuring ?? [],
      recordedAt: state.joinedAt,
    };
  });

  // --- trainer notes ---
  const notes: Prisma.TrainerNoteCreateManyInput[] = [];
  const noteTexts = [
    "Bol u donjem delu leđa — izbegavati duboke fleksije, fokus na stabilizaciju.",
    "Odlična aktivacija centra, spremna za srednji nivo opterećenja.",
    "Radi na mobilnosti ramena; kraći opseg na footwork seriji.",
  ];
  [0, 2, 20].forEach((clientIdx, i) => {
    const attended = bookings.find((b) => b.clientIdx === clientIdx && b.consumed && !b.canceledAt);
    if (!attended) return;
    notes.push({
      sessionId: attended.sessionId,
      clientProfileId: clientState[clientIdx]!.clientProfileId,
      trainerUserId: attended.session.trainerUserId,
      note: noteTexts[i]!,
      createdAt: attended.session.endsAt,
    });
  });
  const freeformNotes: Array<{ clientIdx: number; trainer: TrainerKey; note: string }> = [
    { clientIdx: 5, trainer: "ivana", note: "Preferira večernje termine; pitati za produženje paketa sledeće nedelje." },
    { clientIdx: 34, trainer: "marko", note: "Napredak u kondiciji vidljiv — dodati intervale na sledećem treningu." },
    { clientIdx: 44, trainer: "jelena", note: "Dijagnostika urađena, blaga osteopenija — program prilagođen." },
  ];
  for (const f of freeformNotes) {
    notes.push({
      clientProfileId: clientState[f.clientIdx]!.clientProfileId,
      trainerUserId: trainerIds[f.trainer],
      note: f.note,
      createdAt: new Date(RUN_TIME.getTime() - (2 + rand() * 10) * DAY_MS),
    });
  }

  // --- a few notifications so the client notifications screen has content ---
  const notifications: Prisma.NotificationLogCreateManyInput[] = [];
  for (const clientIdx of [0, 1, 2, 3, 4]) {
    const upcoming = bookings.find((b) => b.clientIdx === clientIdx && !b.canceledAt && b.startsAt.getTime() > RUN_TIME.getTime());
    if (!upcoming) continue;
    const d = upcoming.startsAt;
    const when = `${d.toLocaleDateString("sr-RS")} u ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    notifications.push({
      userId: clientState[clientIdx]!.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: "Rezervacija potvrđena",
      body: `Vaš termin ${when} je potvrđen. Vidimo se u studiju!`,
      pushSent: false,
      readAt: clientIdx % 2 === 0 ? new Date(RUN_TIME.getTime() - 5 * HOUR_MS) : null,
      createdAt: upcoming.createdAt,
    });
  }

  // --- reconcile holds against credits (authoritative post-pass) ---
  // Forward generation can't perfectly respect the runtime's per-client
  // per-class hold count when a client owns overlapping same-class packages
  // (an expired + an active reformer pack share their waitlist seats). Rather
  // than thread that coupling through generation, trim excess FUTURE holds here
  // so that for every class type a client can afford, aggregate held ≤ aggregate
  // live credits — guaranteeing the client-facing `bookable` never floors at 0
  // from a phantom hold. Waitlist seats are trimmed before bookings (a seat is
  // the more expendable hold in a demo). Deterministic: newest-session-first.
  const programOf = (sessionId: string) =>
    sessions.find((s) => s.id === sessionId)?.program ?? null;
  const liveCreditsByClientClass = new Map<string, number>();
  for (const p of packages) {
    if (p.expiresAt.getTime() <= RUN_TIME.getTime()) continue;
    const key = `${p.clientProfileId}::${PACK_PROGRAM[p.packKey]}`;
    liveCreditsByClientClass.set(
      key,
      (liveCreditsByClientClass.get(key) ?? 0) +
        Math.max(0, packSize(p.packKey) - p.consumed),
    );
  }
  const isFutureHeld = (startsAt: Date) => startsAt.getTime() > RUN_TIME.getTime();
  for (const [key, credits] of liveCreditsByClientClass) {
    const [clientProfileId, program] = key.split("::") as [string, ProgramKey];
    const futureWaitlist = waitlist
      .filter(
        (w) =>
          w.clientProfileId === clientProfileId &&
          programOf(w.sessionId) === program &&
          sessions.find((s) => s.id === w.sessionId)?.startsAt.getTime()! >
            RUN_TIME.getTime(),
      )
      .sort(
        (a, b) =>
          (sessions.find((s) => s.id === b.sessionId)?.startsAt.getTime() ?? 0) -
          (sessions.find((s) => s.id === a.sessionId)?.startsAt.getTime() ?? 0),
      );
    const futureBookings = bookings
      .filter(
        (b) =>
          b.clientProfileId === clientProfileId &&
          !b.canceledAt &&
          PACK_PROGRAM[
            packages.find((p) => p.id === b.clientPackageId)?.packKey ?? ("" as PackKey)
          ] === program &&
          isFutureHeld(b.startsAt),
      )
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

    let held = futureWaitlist.length + futureBookings.length;
    // Drop newest waitlist seats first.
    for (const w of futureWaitlist) {
      if (held <= credits) break;
      const idx = waitlist.indexOf(w);
      if (idx >= 0) waitlist.splice(idx, 1);
      held--;
    }
    // Still over? Cancel newest future bookings (mark canceled — realistic, and
    // leaves the row for history rather than deleting it).
    for (const b of futureBookings) {
      if (held <= credits) break;
      b.canceledAt = new Date(b.startsAt.getTime() - 3 * DAY_MS);
      held--;
    }
  }

  return {
    clientState,
    users,
    profiles,
    authAccounts,
    schedules,
    sessions,
    packages,
    bookings,
    waitlist,
    pauses,
    billing,
    consents,
    intakes,
    notes,
    notifications,
    packSize,
  };
}

// ---------------------------------------------------------------------------
// Write + verify
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Target DB host: ${new URL(process.env.DATABASE_URL!).host}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : WIPE_ONLY ? "WIPE ONLY" : "seed"}\n`);

  const catalog = await resolveCatalog();
  console.log("Resolved catalog:");
  for (const [key, ct] of Object.entries(catalog.classTypes)) console.log(`  classType ${key} → "${ct.name}" (max ${ct.maxClients})`);
  for (const [key, r] of Object.entries(catalog.rooms)) console.log(`  room ${key} → "${r.name}" (cap ${r.capacity})`);
  for (const [key, p] of Object.entries(catalog.packageTypes)) console.log(`  packageType ${key} → "${p.name}" (${p.sessionCount}x / ${p.validityDays}d / cancel ${p.lateCancelHours}h)`);
  for (const n of catalog.notices) console.log(`  CATALOG CHANGE: ${n}`);
  console.log();

  await cleanup(catalog);
  if (WIPE_ONLY) {
    console.log("Wipe complete. Admins, catalog, and non-demo users untouched.");
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);
  const g = generate(catalog, passwordHash);

  const activeBookings = g.bookings.filter((b) => !b.canceledAt);
  const fullSessions = g.sessions.filter((s) => s.capacity > 0 && s.booked >= s.capacity);
  console.log("Plan:");
  console.log(`  users: ${g.users.length} (3 trainers + ${g.profiles.length} clients)`);
  console.log(`  recurring schedules: ${g.schedules.length}, sessions: ${g.sessions.length} (weeks -${PAST_WEEKS}..+${FUTURE_WEEKS - 1}, ${SESSION_MINS}min)`);
  console.log(`  packages: ${g.packages.length} (${g.packages.filter((p) => p.isPrev).length} historical), billing records: ${g.billing.length}`);
  console.log(`  bookings: ${g.bookings.length} (${activeBookings.length} active, ${g.bookings.length - activeBookings.length} canceled)`);
  console.log(`  consumptions: ${g.bookings.filter((b) => b.consumed).length}, waitlist entries: ${g.waitlist.length}, full sessions: ${fullSessions.length}`);
  console.log(`  consents: ${g.consents.length}, intakes: ${g.intakes.length}, notes: ${g.notes.length}, notifications: ${g.notifications.length}\n`);

  if (DRY_RUN) {
    console.log("Dry run — nothing written.");
    return;
  }

  await prisma.user.createMany({ data: g.users });
  await prisma.clientProfile.createMany({ data: g.profiles });
  await prisma.authAccount.createMany({ data: g.authAccounts });
  await prisma.recurringSchedule.createMany({ data: g.schedules });
  await prisma.session.createMany({
    data: g.sessions.map((s) => ({
      id: s.id,
      classTypeId: catalog.classTypes[s.program].id,
      roomId: s.roomId,
      trainerUserId: s.trainerUserId,
      recurringScheduleId: s.scheduleId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      capacity: s.capacity,
      isActive: true,
      status: s.status,
    })),
  });
  await prisma.clientPackage.createMany({
    data: g.packages.map((p) => ({
      id: p.id,
      clientProfileId: p.clientProfileId,
      packageTypeId: catalog.packageTypes[p.packKey].id,
      lateCancelHours: catalog.packageTypes[p.packKey].lateCancelHours,
      startsAt: p.startsAt,
      expiresAt: p.expiresAt,
      // Credit balance only — sessions actually CONSUMED (attended / late-cancel
      // forfeited). Future bookings are NOT subtracted here: the runtime treats
      // them as a separate "hold" layer and the client UI shows
      // `bookable = sessionsRemaining − heldCount`. Subtracting futureBooked here
      // too double-counts every held booking, flooring bookable at 0 ("0/12,
      // can't book"). Generation still budgets against holds via `remaining()`.
      sessionsRemaining: Math.max(0, g.packSize(p.packKey) - p.consumed),
      // The demo never grants bonus sessions, so granted == the SKU's count and
      // every "x/y" site reads the SKU size it always did.
      sessionsGranted: g.packSize(p.packKey),
      createdAt: new Date(Math.min(p.startsAt.getTime() - DAY_MS, RUN_TIME.getTime() - HOUR_MS)),
    })),
  });
  // The activation-time class-type snapshot. Its own createMany because
  // createMany can't nest relation writes.
  await prisma.clientPackageClassType.createMany({
    data: g.packages.map((p) => ({
      clientPackageId: p.id,
      classTypeId: catalog.packageTypes[p.packKey].classTypeId,
    })),
  });
  await prisma.packagePause.createMany({ data: g.pauses });
  await prisma.booking.createMany({
    data: g.bookings.map((b) => ({
      sessionId: b.sessionId,
      clientProfileId: b.clientProfileId,
      clientPackageId: b.clientPackageId,
      createdAt: b.createdAt,
      canceledAt: b.canceledAt,
    })),
  });
  // Payroll snapshots are frozen copies, not joins — they must outlive the
  // client and package rows they describe, so the names and the per-session
  // value are resolved here and written flat.
  const packByIdForPayroll = new Map(g.packages.map((p) => [p.id, p]));
  await prisma.sessionConsumption.createMany({
    data: g.bookings
      .filter((b) => b.consumed)
      .map((b) => {
        const pkg = b.clientPackageId ? packByIdForPayroll.get(b.clientPackageId) : undefined;
        const spec = g.clientState[b.clientIdx]!.spec;
        const total = pkg ? g.packSize(pkg.packKey) : 0;
        return {
          clientProfileId: b.clientProfileId,
          sessionId: b.sessionId,
          // Late-canceled bookings are charged at cancel time, not at class end.
          consumedAt: b.canceledAt ?? b.session.endsAt,
          // Mirrors valueSession: price / sessions total, null when nothing
          // backed the attendance so the report flags it instead of zeroing it.
          sessionValue: pkg && total > 0 ? Math.round(PRICES[pkg.packKey] / total) : null,
          clientName: `${spec.firstName} ${spec.lastName}`,
          packageName: pkg ? catalog.packageTypes[pkg.packKey].name : null,
          isGift: false,
          isTrial: false,
        };
      }),
  });
  await prisma.waitlistEntry.createMany({ data: g.waitlist });
  await prisma.billingRecord.createMany({ data: g.billing });
  await prisma.consentRecord.createMany({ data: g.consents });
  await prisma.clientHealthIntake.createMany({ data: g.intakes });
  await prisma.trainerNote.createMany({ data: g.notes });
  await prisma.notificationLog.createMany({ data: g.notifications });

  console.log("Seed written. Verifying invariants...\n");

  const demoSessionIds = g.sessions.map((s) => s.id);
  const grouped = await prisma.booking.groupBy({
    by: ["sessionId"],
    where: { sessionId: { in: demoSessionIds }, canceledAt: null },
    _count: { _all: true },
  });
  const capById = new Map(g.sessions.map((s) => [s.id, s.capacity]));
  const overbooked = grouped.filter((r) => r._count._all > (capById.get(r.sessionId) ?? 0));

  const negativeRemaining = await prisma.clientPackage.count({ where: { sessionsRemaining: { lt: 0 } } });

  // sessionsRemaining is a pure credit balance; future bookings AND future
  // waitlist seats are a separate hold layer, counted at read time as heldCount
  // (see countHeldSessions). If a package's stored credits ever fall below that
  // held count, the client-facing `bookable = sessionsRemaining − heldCount`
  // floors at 0 — the "0/12, can't book anything even after canceling" bug.
  // This check mirrors the runtime exactly: bookings are per-package, waitlist
  // seats are per-client per-class-type (they carry no package FK).
  const activePackages = g.packages.filter(
    (p) => !p.isPrev && p.expiresAt.getTime() > RUN_TIME.getTime(),
  );
  const sessionById = new Map(g.sessions.map((s) => [s.id, s]));
  const classTypeIdByPackKey = (k: PackKey) => catalog.packageTypes[k].classTypeId;

  const heldBookingsByPackage = new Map<string, number>();
  for (const b of g.bookings) {
    if (b.canceledAt || !b.clientPackageId) continue;
    if (b.startsAt.getTime() <= RUN_TIME.getTime()) continue;
    heldBookingsByPackage.set(
      b.clientPackageId,
      (heldBookingsByPackage.get(b.clientPackageId) ?? 0) + 1,
    );
  }
  // Future waitlist seats keyed by clientProfileId → classTypeId → count.
  const waitlistByClientClass = new Map<string, number>();
  for (const w of g.waitlist) {
    const session = sessionById.get(w.sessionId);
    if (!session || session.startsAt.getTime() <= RUN_TIME.getTime()) continue;
    const classTypeId = catalog.classTypes[session.program]?.id;
    if (!classTypeId) continue;
    const key = `${w.clientProfileId}::${classTypeId}`;
    waitlistByClientClass.set(key, (waitlistByClientClass.get(key) ?? 0) + 1);
  }
  const oversubscribed = activePackages.filter((p) => {
    const stored = Math.max(0, g.packSize(p.packKey) - p.consumed);
    const heldBookings = heldBookingsByPackage.get(p.id) ?? 0;
    const heldWaitlist =
      waitlistByClientClass.get(
        `${p.clientProfileId}::${classTypeIdByPackKey(p.packKey)}`,
      ) ?? 0;
    return heldBookings + heldWaitlist > stored;
  });

  const waitlistSessionIds = [...new Set(g.waitlist.map((w) => w.sessionId))];
  const waitlistNotFull: string[] = [];
  for (const sid of waitlistSessionIds) {
    const count = grouped.find((r) => r.sessionId === sid)?._count._all ?? 0;
    if (count < (capById.get(sid) ?? 0)) waitlistNotFull.push(sid);
  }

  const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
  const masa = await prisma.user.findFirst({ where: { email: { contains: "miskovic.masa" } }, select: { email: true } });

  const check = (label: string, ok: boolean, detail = "") =>
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  check("no session overbooked", overbooked.length === 0, overbooked.length ? `${overbooked.length} overbooked` : "");
  check("no negative sessionsRemaining", negativeRemaining === 0);
  check(
    "no package oversubscribed by holds (bookable >= 0)",
    oversubscribed.length === 0,
    oversubscribed.length ? `${oversubscribed.length} oversubscribed` : "",
  );
  check("waitlists only on full sessions", waitlistNotFull.length === 0, waitlistNotFull.join(", "));
  check("admins untouched", adminCount >= 3, `${adminCount} admin(s)`);
  check("non-demo client preserved", masa !== null, masa?.email ?? "miskovic.masa NOT FOUND");

  console.log(`\nDemo login (any trainer/client): password ${PASSWORD}`);
  console.log(`Example client: ${g.users.find((u) => u.role === UserRole.CLIENT)?.email}`);
  console.log(`Trainers: ${g.users.filter((u) => u.role === UserRole.TRAINER).map((u) => u.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("Staging demo seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
