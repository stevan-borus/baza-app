/**
 * Admin Beleške — every TrainerNote about every client, with write access.
 * Pushed from the Klijenti list header (it lives under Klijenti rather than
 * on the tab bar, which a 6th tab made too tight on smaller phones). The
 * shared <NotesFeed> carries all behavior; this screen selects the admin
 * audience and a detail header so it gets a back button.
 */

import { NotesFeed } from "@/components/shared/notes-feed";

export default function AdminKlijentiBeleske() {
  return <NotesFeed audience="admin" headerVariant="detail" />;
}
