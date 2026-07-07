/**
 * Turn a mutation error into a user-facing message.
 *
 * This helper unwraps the structured `ApiError` bodies the API returns and
 * builds a specific, LOCALIZED message from `t(...)` keys. For anything it does
 * not recognize — a bare 4xx like "Invalid payload", a 502/5xx gateway failure,
 * a network drop, a client-side ZodError — it returns the caller's localized
 * `t(...)` fallback. It NEVER surfaces the server's or an exception's raw
 * English `.message`: doing so leaked English into a Serbian UI (the reported
 * "502 in English" bug). The language shown always matches the app's language.
 *
 * Currently produces a specific message for:
 *  - Schedule conflict (single occurrence) — POST/PATCH /sessions
 *  - Schedule conflict (recurring, list of occurrences) — POST /sessions/recurring
 *
 * Everything else → the localized fallback. To give another failure its own
 * localized copy, add a recognizer + `t(...)` mapping here (like the conflict
 * bodies), never by returning `error.message`.
 */
import type { TFunction } from "i18next";
import dayjs from "dayjs";
import { ApiError } from "@/lib/api-error";

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
    // A non-ApiError carries only raw English (a fetch failure, a client-side
    // ZodError, a thrown string). None of it is localized, so it must never
    // reach the user under a non-English UI — return the caller's localized
    // fallback instead of leaking `error.message`.
    return fallback;
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
  // Any other error (unrecognized 4xx like "Invalid payload"/"Invalid startsAt
  // date", a 5xx/502 gateway failure whose body couldn't be parsed, a network
  // drop) carries only the server's hardcoded English in `error.message`. That
  // English must not surface under a Serbian UI — return the caller's localized
  // fallback. Structured, already-localized messages are handled above; only
  // machine/English noise reaches here.
  return fallback;
}
