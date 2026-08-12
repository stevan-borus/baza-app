import { z } from "zod";
import { dateOfBirthSchema, nameFieldSchema, userRoleSchema } from "./common";

// The invite fields as they exist on the Prisma UserInvite model — picked and
// extended below. Hand-written so this package no longer depends on the
// generated prisma-zod tree for a single picked field-set.
const userInviteFieldsSchema = z.object({
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
});

// Role is capped at TRAINER by design: admin accounts are created
// deliberately out-of-band (seed/DB), never through the invite path.
export const inviteRoleSchema = z.enum(["CLIENT", "TRAINER"]);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const createInviteInputSchema = userInviteFieldsSchema
  .pick({
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
  })
  .extend({
    firstName: nameFieldSchema,
    lastName: nameFieldSchema,
    phone: z.string().min(6).max(30).optional(),
    role: inviteRoleSchema.default("CLIENT"),
    // Required for CLIENT (enforced below — it feeds clientProfile at
    // redemption); a trainer has no clientProfile, so no DOB is collected.
    dateOfBirth: dateOfBirthSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "CLIENT" && value.dateOfBirth === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "dateOfBirth is required for client invites",
      });
    }
  });

export const completeInviteInputSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(6).max(128),
});

export const requestPasswordResetInputSchema = z.object({
  email: z.email(),
});

export const signInInputSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(128),
});

export const resetPasswordInputSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(6).max(128),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(), // derived server-side; kept for display sites
  role: userRoleSchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  clientProfile: z.object({ id: z.string() }).nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authMeResponseSchema = z.object({
  success: z.boolean(),
  user: sessionUserSchema,
});

// POST /api/auth/complete-invite — the just-created user, plus the derived
// fullName. The session cookie rides on the response headers, not the body.
export const completeInviteResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: userRoleSchema,
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(), // derived server-side
  }),
});

export const signInResponseSchema = z.object({
  token: z.optional(z.string()),
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});
