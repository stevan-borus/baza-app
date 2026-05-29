/**
 * Trainer Notes screen — the trainer's personal feed of TrainerNotes.
 * All behavior lives in the shared <NotesFeed>; this screen just selects
 * the trainer audience (own notes, always-editable).
 */

import { NotesFeed } from "@/components/shared/notes-feed";

export default function TrainerNotes() {
  return <NotesFeed audience="trainer" />;
}
