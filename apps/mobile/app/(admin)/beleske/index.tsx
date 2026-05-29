/**
 * Admin Beleške tab — the admin's view of every TrainerNote about every
 * client, with the ability to write new ones. All behavior lives in the
 * shared <NotesFeed>; this screen selects the admin audience (sees all
 * notes, edit-own, delete-any) and supplies the admin tab's avatar left slot.
 */

import { NotesFeed } from "@/components/shared/notes-feed";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";

export default function AdminBeleske() {
  return <NotesFeed audience="admin" leftSlot={<AdminTabLeftSlot />} />;
}
