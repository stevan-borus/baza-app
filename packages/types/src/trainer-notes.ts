import { z } from "zod";

export const trainerNoteInputSchema = z.object({
  sessionId: z.uuid().optional(),
  clientProfileId: z.uuid(),
  note: z.string().min(1).max(500),
});
export type TrainerNoteInput = z.infer<typeof trainerNoteInputSchema>;

// Comma-separated UUIDs → string[]. Accepts a single UUID or several; the
// server treats the result as an `in` filter on the corresponding column.
const csvUuids = z
  .string()
  .optional()
  .transform((s) => {
    if (!s) return undefined;
    const parts = s
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return parts.length > 0 ? parts : undefined;
  })
  .pipe(z.array(z.uuid()).min(1).max(50).optional());

export const trainerNotesQuerySchema = z.object({
  // Singular form kept for back-compat with any existing callers; the
  // plural forms below take precedence when both are sent.
  sessionId: z.uuid().optional(),
  clientProfileId: z.uuid().optional(),
  sessionIds: csvUuids,
  clientProfileIds: csvUuids,
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});
export type TrainerNotesQuery = z.infer<typeof trainerNotesQuerySchema>;

export const updateTrainerNoteInputSchema = z.object({
  note: z.string().min(1).max(500),
});
export type UpdateTrainerNoteInput = z.infer<typeof updateTrainerNoteInputSchema>;
