import { z } from "zod";

export const consentDocumentKeySchema = z.enum([
  "tos",
  "privacy",
  "eula",
  "waiver_adult",
  "waiver_minor",
  "social_media",
  "health_intake",
]);
export type ConsentDocumentKey = z.infer<typeof consentDocumentKeySchema>;

export const consentStatusPendingSchema = z.object({
  key: consentDocumentKeySchema,
  currentVersion: z.number().int().positive(),
  reason: z.enum(["missing", "outdated"]),
});

export const consentStatusResponseSchema = z.object({
  success: z.literal(true),
  pending: z.array(consentStatusPendingSchema),
  guardianVerificationNeeded: z.boolean(),
  socialMediaDecided: z.boolean(),
  socialMediaLatestAccepted: z.boolean().nullable(),
});
export type ConsentStatusResponse = z.infer<typeof consentStatusResponseSchema>;

export const consentAcceptInputSchema = z
  .object({
    documentKey: consentDocumentKeySchema,
    version: z.number().int().positive(),
    locale: z.enum(["sr", "en"]),
    guardianName: z.string().min(1).max(120).optional(),
    guardianRelation: z.enum(["parent", "legal_guardian"]).optional(),
  })
  .refine(
    (v) =>
      v.documentKey !== "waiver_minor" ||
      (typeof v.guardianName === "string" &&
        v.guardianName.length > 0 &&
        v.guardianRelation !== undefined),
    {
      message:
        "guardianName and guardianRelation are required for waiver_minor",
      path: ["guardianName"],
    },
  );
export type ConsentAcceptInput = z.infer<typeof consentAcceptInputSchema>;

export const socialMediaConsentInputSchema = z.object({
  accepted: z.boolean(),
});
export type SocialMediaConsentInput = z.infer<typeof socialMediaConsentInputSchema>;

// POST /api/consent/accept — echo of the just-created ConsentRecord.
export const consentAcceptResponseSchema = z.object({
  success: z.literal(true),
  record: z.object({
    id: z.string(),
    documentKey: consentDocumentKeySchema,
    version: z.number().int().positive(),
    acceptedAt: z.string(), // ISO date string when JSON-serialized
  }),
});

// POST /api/consent/social-media — echo of the recorded Da/Ne decision.
export const socialMediaConsentResponseSchema = z.object({
  success: z.literal(true),
  record: z.object({
    id: z.string(),
    accepted: z.boolean(),
    acceptedAt: z.string(), // ISO date string when JSON-serialized
  }),
});

export const legalDocumentResponseSchema = z.object({
  success: z.literal(true),
  key: consentDocumentKeySchema,
  version: z.number().int().positive(),
  locale: z.enum(["sr", "en"]),
  body: z.string(),
});

export const legalDocumentsListResponseSchema = z.object({
  success: z.literal(true),
  documents: z.array(
    z.object({
      key: consentDocumentKeySchema,
      version: z.number().int().positive(),
      locale: z.enum(["sr", "en"]),
    }),
  ),
});
