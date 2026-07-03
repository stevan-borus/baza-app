import { z } from "zod";
import { ClientPackageInputSchema } from "./generated/prisma-zod/schemas/variants/input/ClientPackage.input";
import { PackagePauseInputSchema } from "./generated/prisma-zod/schemas/variants/input/PackagePause.input";

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
});
export type ClientPackageTimelineEntry = z.infer<
  typeof clientPackageTimelineEntrySchema
>;

export const clientPackagesTimelineResponseSchema = z.object({
  success: z.boolean(),
  entries: z.array(clientPackageTimelineEntrySchema),
});
export type ClientPackagesTimelineResponse = z.infer<
  typeof clientPackagesTimelineResponseSchema
>;

export const packagePauseInputSchema = PackagePauseInputSchema.pick({
  clientProfileId: true,
  startsAt: true,
  endsAt: true,
  reason: true,
}).extend({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(300).optional(),
});
export type PackagePauseInput = z.infer<typeof packagePauseInputSchema>;

export const createClientPackageInputSchema = ClientPackageInputSchema.pick({
  clientProfileId: true,
  packageTypeId: true,
  startsAt: true,
}).extend({
  startsAt: z.string().min(10),
});
export type CreateClientPackageInput = z.infer<
  typeof createClientPackageInputSchema
>;
