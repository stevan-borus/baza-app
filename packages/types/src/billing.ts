import { z } from "zod";

// The BillingRecord create-input fields as they exist on the Prisma model —
// picked and extended below. `method` keeps the Prisma PaymentMethod enum
// (CASH/CARD/COMPANY/MANUAL_ONLINE); amount/notes are overridden in the
// extend. Hand-written so the package no longer imports the generated
// prisma-zod tree for this shape.
const billingRecordFieldsSchema = z.object({
  clientUserId: z.string(),
  amount: z.number().int(),
  method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
  notes: z.string().optional().nullable(),
});

export const billingRecordInputSchema = billingRecordFieldsSchema.pick({
  clientUserId: true,
  amount: true,
  method: true,
  notes: true,
}).extend({
  amount: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  // Only CONFIRMED (paid now) and PENDING (pay-later assign) are creatable.
  // VOIDED exists solely as the outcome of a package revoke — it can never
  // be written directly through the API.
  status: z.enum(["CONFIRMED", "PENDING"]).optional(),
  packageTypeId: z.uuid().optional(),
  activatePackageOnConfirm: z.boolean().default(true),
});

// PATCH /api/billing/[id] — confirm a pay-later record once the client pays
// in person. Method may be corrected at confirm time (they may have promised
// cash but paid by card).
export const updateBillingRecordInputSchema = z.object({
  status: z.literal("CONFIRMED"),
  method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]).optional(),
});

// GET /api/billing — admin Naplata list. Serialized BillingRecord rows joined
// in-memory with the paying client's identity.
export const billingRecordSchema = z.object({
  id: z.string(),
  clientUserId: z.string(),
  amount: z.number(),
  method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
  status: z.enum(["CONFIRMED", "PENDING", "VOIDED"]),
  notes: z.nullable(z.string()).optional(),
  createdAt: z.string(),
  // FK back-link to the ClientPackage this payment activated (null for a
  // payment-only row). Surfaced so the Naplata pending sheet can offer the
  // package-revoke ("void") path in place of confirm when the client never
  // paid — the void action needs this id to hit the revoke endpoint.
  clientPackageId: z.nullable(z.string()).optional(),
  // Client identity for the Naplata list card. Nullable because the GET
  // endpoint joins in-memory (no FK) and a deleted-user payment would
  // otherwise drop off the list.
  client: z
    .nullable(
      z.object({
        fullName: z.string(),
        email: z.string(),
      }),
    )
    .optional(),
});
export type BillingRecord = z.infer<typeof billingRecordSchema>;

export const billingResponseSchema = z.object({
  success: z.boolean(),
  records: z.array(billingRecordSchema),
  nextCursor: z.nullable(z.string()).optional(),
});

// GET /api/billing/summary — filter-wide aggregate for the Naplata hero +
// StatStrip. Separate from the paginated list because these totals must span
// the WHOLE matching set (the whole month, or the whole search), not the
// pages loaded so far — deriving them from loaded records understated every
// figure until the admin scrolled. Takes the SAME filters as the list
// (clientUserId, from, to, q) so hero/count/avg stay in sync with the rows.
// `distinctClients` is the denominator for the client-side "avg per client"
// (totalRevenue / distinctClients) — kept server-computed so it too is
// filter-wide, not per-page.
export const billingSummaryResponseSchema = z.object({
  success: z.boolean(),
  totalRevenue: z.number(),
  count: z.number(),
  distinctClients: z.number(),
});

// POST /api/billing — the payment row as created (full row, no select), plus
// the ClientPackage the payment activated. `clientPackage` is null when the
// record doesn't activate a package; `payment.clientPackageId` is null even
// when a package WAS activated because the row is captured before the FK
// back-link update inside the same transaction.
export const createBillingRecordResponseSchema = z.object({
  success: z.boolean(),
  payment: z.object({
    id: z.string(),
    clientUserId: z.string(),
    amount: z.number(),
    method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
    status: z.enum(["CONFIRMED", "PENDING", "VOIDED"]),
    notes: z.string().nullable(),
    packageTypeId: z.string().nullable(),
    clientPackageId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  clientPackage: z
    .object({
      id: z.string(),
      // Snapshotted covered ClassType set (ADR-0010) — ids only; the POST
      // caller already knows the names from the PackageType it just assigned.
      classTypeIds: z.array(z.string()),
      startsAt: z.string(),
      expiresAt: z.string(),
      sessionsRemaining: z.number(),
    })
    .nullable(),
});

// PATCH /api/billing/[id] — the record after a PENDING → CONFIRMED flip.
export const updateBillingRecordResponseSchema = z.object({
  success: z.boolean(),
  payment: z.object({
    id: z.string(),
    clientUserId: z.string(),
    amount: z.number(),
    method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
    status: z.enum(["CONFIRMED", "PENDING", "VOIDED"]),
    notes: z.string().nullable(),
    packageTypeId: z.string().nullable(),
    clientPackageId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});
