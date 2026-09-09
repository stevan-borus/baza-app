import { z } from "zod";

/**
 * Staff rows for the Admin screen that manages sign-in locks. Clients are not
 * listed here (they reach an Admin through the client screens), but unlock
 * itself works for any role.
 */
export const adminUserSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(), // derived server-side
  email: z.email(),
  role: z.enum(["ADMIN", "TRAINER"]),
  // Only ever a lock still in the future; an expired one reads as null.
  lockedUntil: z.nullable(z.string()),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUsersResponseSchema = z.object({
  success: z.literal(true),
  users: z.array(adminUserSchema),
});

export const unlockUserResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({ id: z.string(), lockedUntil: z.null() }),
});
