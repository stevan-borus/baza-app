import { z } from "zod";

/**
 * A Campaign audience: optional axes ANDed together. `everyone` is mutually
 * exclusive with any narrowing axis. At least one axis must be chosen. The
 * audience is RE-COMPUTED at dispatch — this is only the stored intent.
 */
export const campaignAudienceSpecSchema = z
  .object({
    everyone: z.boolean().optional(),
    packageState: z.enum(["active", "expired", "none", "paused"]).optional(),
    classTypeId: z.guid().optional(),
    expiringSoonDays: z.number().int().positive().max(365).optional(),
    lapsedDays: z.number().int().positive().max(365).optional(),
    idlePackageDays: z.number().int().positive().max(365).optional(),
  })
  .refine(
    (spec) => {
      const narrowing =
        spec.packageState !== undefined ||
        spec.classTypeId !== undefined ||
        spec.expiringSoonDays !== undefined ||
        spec.lapsedDays !== undefined ||
        spec.idlePackageDays !== undefined;
      if (spec.everyone) return !narrowing;
      return narrowing;
    },
    {
      message:
        "Choose 'everyone' alone, or one or more narrowing axes (not both).",
    },
  )
  .refine(
    // `lapsed` means "no active package"; `idlePackage` means "has an active
    // package". They are mutually contradictory — ANDing them is always empty
    // and nonsensical — so forbid the combination at the boundary rather than
    // silently returning nobody.
    (spec) => !(spec.lapsedDays !== undefined && spec.idlePackageDays !== undefined),
    {
      message:
        "'lapsed' and 'idle package' are mutually exclusive (one means no active package, the other requires one).",
    },
  );
export type CampaignAudienceSpec = z.infer<typeof campaignAudienceSpecSchema>;

export const createCampaignInputSchema = z.object({
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(4000),
  audienceSpec: campaignAudienceSpecSchema,
  /** ISO instant; when present the campaign is saved SCHEDULED. */
  scheduledFor: z.iso.datetime().optional(),
  /** When true (and no scheduledFor) the campaign dispatches immediately. */
  sendNow: z.boolean().optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;

export const updateCampaignInputSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  body: z.string().min(1).max(4000).optional(),
  audienceSpec: campaignAudienceSpecSchema.optional(),
  scheduledFor: z.iso.datetime().nullable().optional(),
  /** Set "DRAFT" to cancel a SCHEDULED campaign back to a draft. */
  status: z.enum(["DRAFT", "SCHEDULED"]).optional(),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignInputSchema>;
