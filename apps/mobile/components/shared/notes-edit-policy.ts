/**
 * Pure edit-own policy for TrainerNotes, kept free of React Native imports so
 * it can be unit-tested in a node environment without mocking the RN runtime.
 */

import type { TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";

export type NotesAudience = "trainer" | "admin";

/**
 * A note is editable when the viewer authored it. Trainers only ever see
 * their own notes (server-scoped), so the audience shortcut keeps them always
 * editable without needing the viewer id; admins see every note but may edit
 * only the ones they wrote. The PATCH endpoint enforces the same rule, so a
 * `false` here is the friendly half of a defense-in-depth pair, not the only
 * guard.
 */
export function canEditNote(
  audience: NotesAudience,
  note: Pick<TrainerNote, "trainer"> | null,
  viewerUserId: string | null,
): boolean {
  if (note == null) return false;
  if (audience === "trainer") return true;
  return note.trainer?.id != null && note.trainer.id === viewerUserId;
}
