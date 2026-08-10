import { z } from "zod";

// ClientPackage / PackagePause create-input fields as they exist on the Prisma
// models — picked and extended below (date/reason fields are re-validated in
// the extends). Hand-written so the package no longer depends on the generated
// prisma-zod tree for these picked field-sets.
const clientPackageFieldsSchema = z.object({
  clientProfileId: z.string(),
  packageTypeId: z.string(),
  startsAt: z.date(),
});
const packagePauseFieldsSchema = z.object({
  clientProfileId: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  reason: z.string().optional().nullable(),
});

export const clientPackageStatusSchema = z.enum([
  "active",
  "expiring",
  "paused",
  "expired",
  "none",
]);
export type ClientPackageStatus = z.infer<typeof clientPackageStatusSchema>;

// ─── Client-facing packages-&-payments timeline ("Moji paketi") ──────────────
// A read-only, client-scoped mirror of admin Naplata seen through a PACKAGE
// lens. Each entry is one ClientPackage the caller has held.
//   - kind PAID: backed by a BillingRecord — amount + method shown.
//   - kind COMP: a Poklon paket (no BillingRecord) — no amount, no method.
// `method` is softened: COMPANY -> "PAID" (the raw chip is never shown to the
// client), MANUAL_ONLINE -> "ONLINE". A comp leaves no gap.
//
// `paymentPending`: a pay-later package IS funded by a BillingRecord (so it is
// PAID lineage, not a comp/gift), but the record is still PENDING. Reading only
// CONFIRMED billing rendered it as COMP ("Poklon") — a lie the client saw in
// their own history. It now classifies as PAID with this marker set, and the
// UI shows "Nije plaćeno" instead of amount/method. Optional so confirmed and
// comp entries keep validating.
export const clientPackageTimelineEntrySchema = z.object({
  id: z.string(),
  packageTypeName: z.string(),
  sessionsRemaining: z.number(),
  expiresAt: z.string(),
  startsAt: z.string(),
  createdAt: z.string(),
  kind: z.enum(["PAID", "COMP"]),
  amount: z.nullable(z.number()),
  method: z.nullable(z.enum(["CASH", "CARD", "ONLINE", "PAID"])),
  paymentPending: z.boolean().optional(),
});
export type ClientPackageTimelineEntry = z.infer<
  typeof clientPackageTimelineEntrySchema
>;

export const clientPackagesTimelineResponseSchema = z.object({
  success: z.boolean(),
  entries: z.array(clientPackageTimelineEntrySchema),
});

export const packagePauseInputSchema = packagePauseFieldsSchema.pick({
  clientProfileId: true,
  startsAt: true,
  endsAt: true,
  reason: true,
}).extend({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(300).optional(),
});

export const createClientPackageInputSchema = clientPackageFieldsSchema.pick({
  clientProfileId: true,
  packageTypeId: true,
  startsAt: true,
}).extend({
  startsAt: z.string().min(10),
  // Birthday gift only: the admin-picked class-type set the new package covers.
  // Non-empty; each id must be an existing ClassType (checked server-side).
  // Honored ONLY when the chosen PackageType.isBirthdayGift — supplying it for
  // any other SKU is a 400. Lets one 🎂 SKU serve every class type: the gift is
  // snapshotted against the picked set, not the SKU's own covered set.
  classTypeIdsOverride: z.array(z.string()).min(1).optional(),
  // Gift/comp assign: hand over a REAL (priced) package without payment, so no
  // BillingRecord follows and it stays out of revenue. Keeping the real SKU is
  // what lets trainer payout value a gifted session like a paid one.
  isGift: z.boolean().optional(),
  // Sessions the gift actually grants — defaults to 1 server-side, because
  // gifting "Reformer 12" must not hand over all twelve. Capped at the SKU's
  // own sessionCount (checked server-side, where the SKU is known).
  sessionsGranted: z.number().int().min(1).optional(),
});

// ─── GET /api/packages/client-packages ───────────────────────────────────────
// One schema for all three branches (client-own, admin list-all, per-client):
// the optional fields cover the branch-specific extras.

const embeddedPackageTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  sessionCount: z.number(),
  validityDays: z.number(),
  lateCancelHours: z.number().optional(),
});

const embeddedClientSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
});

const embeddedBillingRecordSchema = z.object({
  id: z.string().optional(),
  amount: z.number(),
  method: z.string(),
  // PENDING drives the "Nije plaćeno" tag on admin package rows; VOIDED
  // shows as "Stornirano". Optional so the pre-status responses (and the
  // admin list-all branch) keep validating.
  status: z.enum(["CONFIRMED", "PENDING", "VOIDED"]).optional(),
});

const embeddedClassTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const clientPackageSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  packageTypeId: z.string(),
  // The snapshotted covered ClassType set (id+name for display). One entry =
  // classic single-type package, several = mix package.
  classTypes: z.array(embeddedClassTypeSchema).optional(),
  startsAt: z.string(),
  expiresAt: z.string(),
  sessionsRemaining: z.number(),
  // Effective package total = packageType.sessionCount + bonusSessions, computed
  // server-side so the "x/y termina" arithmetic lives in ONE place. An admin
  // "+1 termin" grant bumps bonusSessions, growing this total (12/12 → 13/13);
  // every UI total site reads THIS, never packageType.sessionCount directly.
  sessionsTotal: z.number(),
  // Set when an admin revoked the package (keep-the-trace semantics): the
  // row stays visible in history, marked "Opozvan", but grants no rights.
  revokedAt: z.string().nullable().optional(),
  // CLIENT branch only: `heldCount` = future uncancelled bookings backed by
  // this package + waitlist seats for its class type; `bookable` =
  // max(0, sessionsRemaining - heldCount) — the number the client-facing UI
  // shows as "left to book". Admin/trainer branches omit both on purpose:
  // admin surfaces speak the raw-credit (sessionsRemaining) language.
  heldCount: z.number().optional(),
  bookable: z.number().optional(),
  // CLIENT branch only: true when this package's funding BillingRecord is
  // still PENDING (a pay-later assignment). The studio's whole flow is
  // pay-on-arrival, so the client must see they still owe payment. Absent /
  // false once the payment is confirmed. Same optional pattern as bookable.
  paymentPending: z.boolean().optional(),
  packageType: embeddedPackageTypeSchema.optional(),
  client: embeddedClientSchema.optional(),
  // Per-client GET path attaches the matching CONFIRMED BillingRecord (or
  // null for comp/gift packages). Admin list-all path omits this field —
  // it stays optional so both responses validate against the same schema.
  billingRecord: embeddedBillingRecordSchema.nullable().optional(),
});
export type ClientPackage = z.infer<typeof clientPackageSchema>;

export const clientPackagesResponseSchema = z.object({
  success: z.boolean(),
  packages: z.array(clientPackageSchema),
  // Cursor-based pagination: opaque string (clientPackage.id) of the last
  // row on this page, or null when this is the final page. Optional in the
  // response shape so the non-paginated branches (per-client list) still
  // validate against the same schema.
  nextCursor: z.nullable(z.string()).optional(),
});

// POST /api/packages/client-packages — the ClientPackage row as selected by
// the create handler.
export const createClientPackageResponseSchema = z.object({
  success: z.boolean(),
  clientPackage: z.object({
    id: z.string(),
    clientProfileId: z.string(),
    packageTypeId: z.string(),
    classTypeIds: z.array(z.string()),
    lateCancelHours: z.number(),
    startsAt: z.string(),
    expiresAt: z.string(),
    sessionsRemaining: z.number(),
    // The "y" in "x/y" — the granted count plus any grant, NOT the SKU's live
    // sessionCount, so a 1-session gift on a 12-session SKU reads "1/1".
    sessionsTotal: z.number(),
    isGift: z.boolean(),
  }),
});

// POST /api/packages/client-packages/[id]/revoke — outcome summary of a
// keep-the-trace revoke: the package is dead (revokedAt set), its FUTURE
// bookings are canceled without late-cancel forfeit, unbacked waitlist seats
// are released, and the funding BillingRecord (if any) is VOIDED.
export const revokeClientPackageResponseSchema = z.object({
  success: z.boolean(),
  clientPackage: z.object({
    id: z.string(),
    revokedAt: z.string(),
  }),
  canceledFutureBookings: z.number(),
  removedWaitlistEntries: z.number(),
  billingRecordVoided: z.boolean(),
});

// POST /api/packages/client-packages/[id]/add-session — the "+1 termin" admin
// grant: sessionsRemaining incremented by one on a still-active package. The
// updated row is echoed back so the caller can reflect the new count without a
// refetch (invalidations still run).
export const addSessionResponseSchema = z.object({
  success: z.boolean(),
  clientPackage: z.object({
    id: z.string(),
    sessionsRemaining: z.number(),
  }),
});

// POST /api/packages/pause — the PackagePause row as selected by the handler.
export const packagePauseResponseSchema = z.object({
  success: z.boolean(),
  pause: z.object({
    id: z.string(),
    clientProfileId: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    reason: z.string().nullable(),
  }),
});
