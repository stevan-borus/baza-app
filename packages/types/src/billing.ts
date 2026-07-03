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
