import { z } from "zod";
import { UserRoleSchema } from "./generated/prisma-zod/schemas/enums/UserRole.schema";
import { UserInviteResultSchema } from "./generated/prisma-zod/schemas/variants/result/UserInvite.result";
import { dateOfBirthSchema, nameFieldSchema } from "./common";

export const inviteClientInputSchema = UserInviteResultSchema.pick({
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
}).extend({
  firstName: nameFieldSchema,
  lastName: nameFieldSchema,
  phone: z.string().min(6).max(30).optional(),
  dateOfBirth: dateOfBirthSchema,
});
export type InviteClientInput = z.infer<typeof inviteClientInputSchema>;

export const completeInviteInputSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(6).max(128),
});
export type CompleteInviteInput = z.infer<typeof completeInviteInputSchema>;

export const requestPasswordResetInputSchema = z.object({
  email: z.email(),
});
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetInputSchema
>;

export const signInInputSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(128),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

export const resetPasswordInputSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(6).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(), // derived server-side; kept for display sites
  role: UserRoleSchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  clientProfile: z.object({ id: z.string() }).nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authMeResponseSchema = z.object({
  success: z.boolean(),
  user: sessionUserSchema,
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

// POST /api/auth/complete-invite — the just-created user, plus the derived
// fullName. The session cookie rides on the response headers, not the body.
export const completeInviteResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: UserRoleSchema,
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(), // derived server-side
  }),
});
export type CompleteInviteResponse = z.infer<
  typeof completeInviteResponseSchema
>;

export const signInResponseSchema = z.object({
  token: z.optional(z.string()),
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;
