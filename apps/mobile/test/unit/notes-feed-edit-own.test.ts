/**
 * Edit-own rule for the shared NotesFeed.
 *
 * Trainers only ever see their own notes (server-scoped), so they're always
 * allowed to edit. Admins see every note but may edit only the ones they
 * authored — a note authored by a trainer is read-only to the admin (delete
 * is still allowed elsewhere; that's moderation, handled separately).
 */
import { describe, it, expect } from "vitest";
import { canEditNote } from "@/components/shared/notes-edit-policy";

const noteBy = (trainerId: string) => ({
  trainer: { id: trainerId, fullName: "Author" },
});

describe("canEditNote", () => {
  it("returns false for a null note", () => {
    expect(canEditNote("admin", null, "u1")).toBe(false);
    expect(canEditNote("trainer", null, "u1")).toBe(false);
  });

  it("lets a trainer edit any note they can see (their own feed)", () => {
    // The trainer feed is server-scoped to the trainer's own notes, so the
    // viewer id is irrelevant — every visible note is theirs.
    expect(canEditNote("trainer", noteBy("someone"), "u1")).toBe(true);
    expect(canEditNote("trainer", noteBy("u1"), "u1")).toBe(true);
  });

  it("lets an admin edit a note they authored themselves", () => {
    expect(canEditNote("admin", noteBy("admin-1"), "admin-1")).toBe(true);
  });

  it("does NOT let an admin edit a note authored by someone else", () => {
    expect(canEditNote("admin", noteBy("trainer-9"), "admin-1")).toBe(false);
  });

  it("returns false for an admin when the viewer id is unknown", () => {
    expect(canEditNote("admin", noteBy("trainer-9"), null)).toBe(false);
  });

  it("returns false for an admin when the note has no author", () => {
    expect(canEditNote("admin", { trainer: undefined }, "admin-1")).toBe(false);
  });
});
