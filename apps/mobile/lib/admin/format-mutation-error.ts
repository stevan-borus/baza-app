/**
 * Turn a mutation error into a user-facing message.
 *
 * Generic mutation rejections used to fall back to "Kreiranje termina nije
 * uspelo" — the admin had no way to tell whether the cause was a schedule
 * conflict, a missing field, or a server crash. This helper unwraps the
 * `ApiError` body shapes the API actually returns and produces a specific
 * message; if the body is unknown it falls back to the caller's generic
 * `t(...)` string.
 *
 * Currently handles:
 *  - Schedule conflict (single occurrence) — POST/PATCH /sessions
 *  - Schedule conflict (recurring, list of occurrences) — POST /sessions/recurring
 *  - Generic structured `{ error: string }` from `lib/server/http.fail()`
 *
 * Extend as more 4xx response shapes appear across the admin surface.
 */
import type { TFunction } from "i18next";
import dayjs from "dayjs";
import { ApiError } from "@/lib/api";

type ScheduleConflictDetails = {
  kind: "room" | "trainer";
  existingStartsAt: string;
  existingEndsAt: string;
  existingRoomName: string | null;
  existingTrainerName: string | null;
  existingClassTypeName: string | null;
};

type SingleConflictBody = {
  error: "Schedule conflict";
  conflict: ScheduleConflictDetails;
};

type RecurringConflictBody = {
  error: "Schedule conflict";
  conflicts: Array<ScheduleConflictDetails & {
    occurrenceStartsAt: string;
    occurrenceEndsAt: string;
  }>;
  conflictCount: number;
  totalOccurrences: number;
};

function isSingleConflictBody(body: unknown): body is SingleConflictBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "conflict" in body &&
    (body as { error?: unknown }).error === "Schedule conflict"
  );
}

function isRecurringConflictBody(body: unknown): body is RecurringConflictBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "conflicts" in body &&
    Array.isArray((body as { conflicts: unknown }).conflicts) &&
    (body as { error?: unknown }).error === "Schedule conflict"
  );
}

function describeConflict(
  c: ScheduleConflictDetails,
  t: TFunction,
  lang: "sr" | "en",
): string {
  const subject =
    c.kind === "room"
      ? c.existingRoomName ?? t("admin.errors.scheduleConflict.fallbackRoom")
      : c.existingTrainerName ??
        t("admin.errors.scheduleConflict.fallbackTrainer");
  const time = dayjs(c.existingStartsAt)
    .locale(lang)
    .format("D.M. HH:mm");
  const klass = c.existingClassTypeName
    ? ` · ${c.existingClassTypeName}`
    : "";
  return `${subject}${klass} · ${time}`;
}

export function formatMutationError(
  error: unknown,
  t: TFunction,
  lang: "sr" | "en",
  fallback: string,
): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message || fallback : fallback;
  }
  // Recurring series — surface up to 3 occurrences with their reason.
  if (isRecurringConflictBody(error.body)) {
    const body = error.body;
    const lines = body.conflicts.map(
      (c) =>
        `• ${dayjs(c.occurrenceStartsAt).locale(lang).format("D.M. HH:mm")} — ${
          c.kind === "trainer"
            ? t("admin.errors.scheduleConflict.trainerBusy", {
                name:
                  c.existingTrainerName ??
                  t("admin.errors.scheduleConflict.fallbackTrainer"),
              })
            : t("admin.errors.scheduleConflict.roomBusy", {
                name:
                  c.existingRoomName ??
                  t("admin.errors.scheduleConflict.fallbackRoom"),
              })
        }`,
    );
    const header =
      body.conflictCount > body.conflicts.length
        ? t("admin.errors.scheduleConflict.recurringHeaderMore", {
            shown: body.conflicts.length,
            total: body.conflictCount,
          })
        : t("admin.errors.scheduleConflict.recurringHeader", {
            count: body.conflictCount,
          });
    return `${header}\n${lines.join("\n")}`;
  }
  // Single occurrence — short one-liner.
  if (isSingleConflictBody(error.body)) {
    const c = error.body.conflict;
    const detail = describeConflict(c, t, lang);
    return c.kind === "trainer"
      ? t("admin.errors.scheduleConflict.trainerBusyShort", { detail })
      : t("admin.errors.scheduleConflict.roomBusyShort", { detail });
  }
  // Other 4xx with a `{ error: string }` body — `ApiError.message` is already
  // the server's text, so return it directly (it may already be human-
  // readable, e.g. "Invalid payload").
  return error.message || fallback;
}
