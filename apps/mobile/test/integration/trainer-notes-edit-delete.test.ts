import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { PATCH, DELETE } from "@/app/api/trainer-notes/[id]/+api";
import { prisma } from "@/lib/server/prisma";

async function seedNoteByTrainer(opts: { trainerEmail: string }) {
  const trainer = await prisma.user.create({
    data: {
      email: opts.trainerEmail,
      fullName: opts.trainerEmail,
      role: "TRAINER",
    },
  });
  const client = await prisma.user.create({
    data: { email: `c-${opts.trainerEmail}`, fullName: "C", role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: `Reformer-${opts.trainerEmail}`, maxClients: 6, durationMins: 60 },
  });
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date("2026-08-10T10:00:00Z"),
      endsAt: new Date("2026-08-10T11:00:00Z"),
      capacity: 6,
      status: "SCHEDULED",
      isActive: true,
    },
  });
  const note = await prisma.trainerNote.create({
    data: {
      sessionId: session.id,
      clientProfileId: profile.id,
      trainerUserId: trainer.id,
      note: "Original note",
    },
  });
  return { trainer, note };
}

function asTrainer(t: { id: string; email: string }) {
  setMockUser({
    id: t.id,
    role: "TRAINER",
    email: t.email,
    isActive: true,
    clientProfile: null,
  });
}

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

describe("trainer-notes PATCH + DELETE", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("PATCH lets the note's owner update the note text", async () => {
    const { trainer, note } = await seedNoteByTrainer({
      trainerEmail: "owner@test.local",
    });
    asTrainer(trainer);
    const response = await PATCH(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Edited by owner" }),
      }),
      { id: note.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.trainerNote.findUnique({ where: { id: note.id } });
    expect(reloaded?.note).toBe("Edited by owner");
  });

  it("PATCH returns 403 when a different trainer tries to edit someone else's note", async () => {
    const { note } = await seedNoteByTrainer({
      trainerEmail: "owner2@test.local",
    });
    const otherTrainer = await prisma.user.create({
      data: { email: "other@test.local", fullName: "Other", role: "TRAINER" },
    });
    asTrainer(otherTrainer);
    const response = await PATCH(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Sneaky edit" }),
      }),
      { id: note.id },
    );
    expect(response.status).toBe(403);
    const reloaded = await prisma.trainerNote.findUnique({ where: { id: note.id } });
    expect(reloaded?.note).toBe("Original note");
  });

  it("DELETE lets the note's owner delete it", async () => {
    const { trainer, note } = await seedNoteByTrainer({
      trainerEmail: "owner3@test.local",
    });
    asTrainer(trainer);
    const response = await DELETE(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "DELETE",
      }),
      { id: note.id },
    );
    expect(response.status).toBe(200);
    expect(await prisma.trainerNote.findUnique({ where: { id: note.id } })).toBeNull();
  });

  it("DELETE returns 403 when a different trainer tries to delete someone else's note", async () => {
    const { note } = await seedNoteByTrainer({
      trainerEmail: "owner4@test.local",
    });
    const otherTrainer = await prisma.user.create({
      data: { email: "other2@test.local", fullName: "Other", role: "TRAINER" },
    });
    asTrainer(otherTrainer);
    const response = await DELETE(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "DELETE",
      }),
      { id: note.id },
    );
    expect(response.status).toBe(403);
    expect(await prisma.trainerNote.findUnique({ where: { id: note.id } })).not.toBeNull();
  });

  it("admin can delete any trainer's note (moderation) but cannot edit another's words", async () => {
    // Edit is authorship-bound for every role — even an admin must not
    // rewrite a trainer's note. Delete stays admin-any: removing a note
    // that shouldn't exist is moderation, not authorship.
    const { note } = await seedNoteByTrainer({
      trainerEmail: "owner5@test.local",
    });
    asAdmin();

    const editResponse = await PATCH(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Admin edit" }),
      }),
      { id: note.id },
    );
    expect(editResponse.status).toBe(403);
    expect(
      (await prisma.trainerNote.findUnique({ where: { id: note.id } }))?.note,
    ).toBe("Original note");

    const deleteResponse = await DELETE(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "DELETE",
      }),
      { id: note.id },
    );
    expect(deleteResponse.status).toBe(200);
    expect(await prisma.trainerNote.findUnique({ where: { id: note.id } })).toBeNull();
  });

  it("admin can edit a note they authored themselves", async () => {
    // The author of a note can always edit it, regardless of role. An
    // admin who wrote the note (trainerUserId === their own id) can edit.
    const admin = await prisma.user.create({
      data: { email: "self-admin@test.local", fullName: "Admin", role: "ADMIN" },
    });
    const client = await prisma.user.create({
      data: { email: "c-self@test.local", fullName: "C", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    const note = await prisma.trainerNote.create({
      data: {
        clientProfileId: profile.id,
        trainerUserId: admin.id,
        note: "Admin's own note",
      },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const response = await PATCH(
      new Request(`http://test.local/api/trainer-notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Edited own note" }),
      }),
      { id: note.id },
    );
    expect(response.status).toBe(200);
    expect(
      (await prisma.trainerNote.findUnique({ where: { id: note.id } }))?.note,
    ).toBe("Edited own note");
  });
});
