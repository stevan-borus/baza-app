/**
 * Single source of truth for mapping a payment method to an i18n label key.
 *
 * Two audiences, two maps — kept here so they can't drift apart silently:
 *
 *   - RAW_METHOD_LABEL_KEYS — back-office (admin Naplata, Izveštaji, the
 *     assign-package sheet). Shows the literal PaymentMethod, including the
 *     COMPANY chip that must NEVER reach a client.
 *
 *   - softenedMethodLabelKey — client "Moji paketi" timeline. Consumes the
 *     already-softened value the server emits (COMPANY -> "PAID",
 *     MANUAL_ONLINE -> "ONLINE"); returns null for a comp entry (no method).
 *
 * Both return i18n KEYS, not copy — the caller runs them through `t()`.
 */

/** Raw PaymentMethod -> admin i18n key. Includes the back-office-only COMPANY chip. */
export const RAW_METHOD_LABEL_KEYS: Record<string, string> = {
  CASH: "admin.manage.methodCash",
  CARD: "admin.manage.methodCard",
  COMPANY: "admin.manage.methodCompany",
  MANUAL_ONLINE: "admin.manage.methodOnline",
};

/** The four values a client may see after server-side softening. */
export type SoftenedMethod = "CASH" | "CARD" | "ONLINE" | "PAID";

/** Softened method -> client i18n key, or null for a comp entry (no method). */
export function softenedMethodLabelKey(
  method: SoftenedMethod | null,
): string | null {
  switch (method) {
    case "CASH":
      return "client.clientPackages.methodCash";
    case "CARD":
      return "client.clientPackages.methodCard";
    case "ONLINE":
      return "client.clientPackages.methodOnline";
    case "PAID":
      return "client.clientPackages.paid";
    case null:
      return null;
  }
}
