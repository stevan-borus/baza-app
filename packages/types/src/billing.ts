import { z } from "zod";
import { BillingRecordInputSchema } from "./generated/prisma-zod/schemas/variants/input/BillingRecord.input";

export const billingRecordInputSchema = BillingRecordInputSchema.pick({
  clientUserId: true,
  amount: true,
  method: true,
  notes: true,
}).extend({
  amount: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  status: z.enum(["CONFIRMED"]).optional(),
  packageTypeId: z.uuid().optional(),
  activatePackageOnConfirm: z.boolean().default(true),
});
export type BillingRecordInput = z.infer<typeof billingRecordInputSchema>;

// GET /api/billing — admin Naplata list. Serialized BillingRecord rows joined
// in-memory with the paying client's identity.
export const billingRecordSchema = z.object({
  id: z.string(),
  clientUserId: z.string(),
  amount: z.number(),
  method: z.enum(["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"]),
  status: z.enum(["CONFIRMED"]),
  notes: z.nullable(z.string()).optional(),
  createdAt: z.string(),
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
export type BillingResponse = z.infer<typeof billingResponseSchema>;

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
    status: z.enum(["CONFIRMED"]),
    notes: z.string().nullable(),
    packageTypeId: z.string().nullable(),
    clientPackageId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  clientPackage: z
    .object({
      id: z.string(),
      classTypeId: z.string(),
      startsAt: z.string(),
      expiresAt: z.string(),
      sessionsRemaining: z.number(),
    })
    .nullable(),
});
export type CreateBillingRecordResponse = z.infer<
  typeof createBillingRecordResponseSchema
>;
