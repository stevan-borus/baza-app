/**
 * Tiny helper to validate a form against a Zod schema and produce a
 * `{ field: localized message }` map for per-field display in `Input.error`.
 *
 * Usage:
 *   const result = validateForm(signInInputSchema, { email, password }, t);
 *   if (!result.ok) { setErrors(result.errors); return; }
 *   mutation.mutate(result.data);
 *
 * Zod issue codes are mapped to translated strings via the `validation.*`
 * namespace in en/sr locales. Falls back to Zod's English message if no
 * translation exists for a code (rare).
 */
import type { TFunction } from "i18next";
import type { ZodIssue, ZodSchema } from "zod";

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export type ValidateFormResult<T> =
  | { ok: true; data: T; errors: null }
  | { ok: false; data: null; errors: FormErrors<T> };

export function validateForm<T extends Record<string, unknown>>(
  schema: ZodSchema<T>,
  values: T,
  t: TFunction,
): ValidateFormResult<T> {
  const result = schema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data, errors: null };
  }
  const errors: FormErrors<T> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    if (errors[field as keyof T]) continue; // first error per field wins
    errors[field as keyof T] = translateIssue(issue, t);
  }
  return { ok: false, data: null, errors };
}

function translateIssue(issue: ZodIssue, t: TFunction): string {
  // Map common Zod issue codes to namespaced i18n keys with a Zod fallback.
  switch (issue.code) {
    case "invalid_type":
      return t("validation.required", { defaultValue: issue.message });
    case "too_small":
      // string min, number min, array min — Zod supplies `minimum`
      return t("validation.tooShort", {
        min: (issue as unknown as { minimum?: number }).minimum,
        defaultValue: issue.message,
      });
    case "too_big":
      return t("validation.tooLong", {
        max: (issue as unknown as { maximum?: number }).maximum,
        defaultValue: issue.message,
      });
    case "invalid_format":
      return t("validation.invalidEmail", { defaultValue: issue.message });
    case "custom":
      // Custom issues set their own message via .refine() — pass through.
      return issue.message;
    default:
      return t("validation.invalid", { defaultValue: issue.message });
  }
}
