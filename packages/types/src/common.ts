import { z } from "zod";
import { UserRoleSchema } from "./generated/prisma-zod/schemas/enums/UserRole.schema";

export const roleSchema = UserRoleSchema;
export type Role = z.infer<typeof roleSchema>;

/** Display name derived from the normalized first/last fields. */
export function formatFullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

/**
 * The name to show for a user in the UI: their real full name, falling back
 * to the email local-part only when no name is on the record (e.g. an
 * incompletely-provisioned account). Single source for every "who is this"
 * label — profile header, settings sheet, greeting — so none of them silently
 * render the email instead of the name.
 */
export function displayName(
  user?: { firstName?: string | null; lastName?: string | null; email?: string | null },
): string {
  const full = formatFullName(user?.firstName ?? "", user?.lastName ?? "");
  if (full) return full;
  return user?.email?.split("@")[0] ?? "";
}

/**
 * A required person-name field. Trims surrounding whitespace *before* the
 * length check, so a whitespace-only input (e.g. "   ") is rejected rather
 * than stored — and a padded value ("  Ana  ") persists clean, keeping the
 * derived `fullName` free of stray/double spaces.
 */
export const nameFieldSchema = z.string().trim().min(1).max(50);

/**
 * Civil-date YYYY-MM-DD string. Server casts to Postgres DATE; UI formats
 * for display via `formatDateOfBirth`. Empty string is treated as absent
 * by the API routes (translated to null before persisting).
 */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine(
    (s) => {
      // The regex above guarantees three numeric parts; the explicit
      // Number() calls keep that obvious to the type-checker under
      // noUncheckedIndexedAccess (a destructure would be `number | undefined`).
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(5, 7));
      const d = Number(s.slice(8, 10));
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d &&
        y >= 1900 &&
        y <= new Date().getUTCFullYear()
      );
    },
    { message: "Not a valid calendar date" },
  );

/**
 * Bare acknowledgement for routes whose whole success contract is "it
 * worked" — e.g. password-reset request/confirm and consent refusal.
 */
export const successResponseSchema = z.object({
  success: z.literal(true),
});
export type SuccessResponse = z.infer<typeof successResponseSchema>;

// GET /api/users/trainers — active staff (trainers + admins) for the
// session trainer pickers. `fullName` is derived server-side.
export const trainerUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  role: z.enum(["ADMIN", "TRAINER"]),
});
export type TrainerUser = z.infer<typeof trainerUserSchema>;

export const trainersResponseSchema = z.object({
  success: z.boolean(),
  users: z.array(trainerUserSchema),
});
export type TrainersResponse = z.infer<typeof trainersResponseSchema>;

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const appThemeTokens = {
  background: "#fdf7f4",
  brand: "#2e5b42",
  accent: "#6e1644",
} as const;
