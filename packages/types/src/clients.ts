import { z } from "zod";
import { dateOfBirthSchema, nameFieldSchema } from "./common";
import { consentDocumentKeySchema } from "./consent";
import { healthIntakeResponseSchema } from "./health-intake";
import { clientPackageStatusSchema } from "./packages";

export const updateClientInputSchema = z.object({
  firstName: nameFieldSchema.optional(),
  lastName: nameFieldSchema.optional(),
  phone: z.string().min(6).max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  // TODO(feat-birthday-gift worktree): tighten this so admins can't null out
  // a CLIENT's DOB — `getConsentStatus` throws on missing DOB, so nulling
  // here would silently break the consent gate for that client. Either drop
  // `.nullable()` entirely or 409 on { dateOfBirth: null } for CLIENT users.
  dateOfBirth: dateOfBirthSchema.nullable().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

export const clientsResponseSchema = z.object({
  success: z.boolean(),
  clients: z.array(
    z.object({
      id: z.string(),
      notes: z.optional(z.nullable(z.string())),
      packageStatus: clientPackageStatusSchema,
      user: z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        fullName: z.string(), // derived
        email: z.email(),
        phone: z.optional(z.nullable(z.string())),
      }),
    }),
  ),
  // Cursor-based pagination: opaque string (clientProfile.id) of the last
  // row on this page, or null when this is the final page. Optional in
  // the response shape so older non-paginated callers (and the existing
  // integration tests that assert specific badge content) still type-check.
  nextCursor: z.nullable(z.string()).optional(),
});
export type ClientsResponse = z.infer<typeof clientsResponseSchema>;

export const clientByIdResponseSchema = z.object({
  success: z.boolean(),
  client: z.object({
    id: z.string(),
    notes: z.nullable(z.string()),
    dateOfBirth: z.nullable(z.string()),
    packageStatus: clientPackageStatusSchema,
    user: z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      fullName: z.string(), // derived
      email: z.email(),
      phone: z.nullable(z.string()),
      isActive: z.boolean(),
    }),
  }),
});
export type ClientByIdResponse = z.infer<typeof clientByIdResponseSchema>;

// GET /api/admin/clients/[id]/consent-records — accepted documents (social
// media excluded) plus the latest social-media decision. Deliberately has NO
// `success` wrapper: the handler returns `ok({ records, socialMedia })`.
export const adminClientConsentRecordsResponseSchema = z.object({
  records: z.array(
    z.object({
      id: z.string(),
      documentKey: consentDocumentKeySchema,
      version: z.number(),
      acceptedAt: z.string(), // ISO date string when JSON-serialized
      guardianVerifiedAt: z.nullable(z.string()),
    }),
  ),
  // null when the client has never been asked (legacy state pre-gate).
  socialMedia: z
    .nullable(z.object({ accepted: z.boolean(), acceptedAt: z.string() }))
    .optional(),
});
export type AdminClientConsentRecordsResponse = z.infer<
  typeof adminClientConsentRecordsResponseSchema
>;

// GET /api/admin/clients/[id]/health — the raw ClientHealthIntake row (same
// shape the client-facing /api/health-intake GET serves, hence the reuse of
// healthIntakeResponseSchema) or null, plus the latest withdrawal timestamp.
export const adminClientHealthResponseSchema = z.object({
  success: z.boolean(),
  intake: z.nullable(healthIntakeResponseSchema),
  withdrawnAt: z.nullable(z.string()),
});
export type AdminClientHealthResponse = z.infer<
  typeof adminClientHealthResponseSchema
>;
