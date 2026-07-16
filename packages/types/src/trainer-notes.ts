import { z } from "zod";

export const trainerNoteInputSchema = z.object({
  sessionId: z.uuid().optional(),
  clientProfileId: z.uuid(),
  note: z.string().min(1).max(500),
});

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

export const updateTrainerNoteInputSchema = z.object({
  note: z.string().min(1).max(500),
});

// ─── Trainer-note response schemas ───────────────────────────────────────────

export const trainerNoteSchema = z.object({
  id: z.string(),
  sessionId: z.nullable(z.string()),
  clientProfileId: z.string(),
  note: z.string(),
  createdAt: z.string(),
  trainer: z
    .object({
      id: z.string(),
      fullName: z.string(),
    })
    .optional(),
  clientProfile: z
    .object({
      user: z.object({
        id: z.string(),
        fullName: z.string(),
      }),
    })
    .optional(),
});
export type TrainerNote = z.infer<typeof trainerNoteSchema>;

// GET /api/trainer-notes
export const trainerNotesResponseSchema = z.object({
  success: z.boolean(),
  notes: z.array(trainerNoteSchema),
  nextCursor: z.nullable(z.string()).optional(),
});
export type TrainerNotesResponse = z.infer<typeof trainerNotesResponseSchema>;

// POST /api/trainer-notes — the TrainerNote row as created.
export const createTrainerNoteResponseSchema = z.object({
  success: z.boolean(),
  note: z.object({
    id: z.string(),
    sessionId: z.string().nullable(),
    clientProfileId: z.string(),
    trainerUserId: z.string(),
    note: z.string(),
    createdAt: z.string(),
  }),
});

// PATCH /api/trainer-notes/[id] — the TrainerNote row as updated.
export const updateTrainerNoteResponseSchema = z.object({
  success: z.boolean(),
  note: z.object({
    id: z.string(),
    sessionId: z.string().nullable(),
    clientProfileId: z.string(),
    trainerUserId: z.string(),
    note: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});
