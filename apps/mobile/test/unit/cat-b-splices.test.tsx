/**
 * Cat B (plain-list splices) — admin mutations splice their returned row into
 * the corresponding plain-list cache via setQueryData instead of invalidating
 * (refetching). Each factory's create appends the returned row; update/revoke/
 * resend replace it by id. The servers were widened (Layer 4) to return the
 * full row, so no refetch round-trip is warranted.
 *
 * Driven via MutationObserver against a real QueryClient (no RTL in this repo),
 * mirroring campaigns-cache-splice.test.tsx. Assertions are state-based: the
 * seeded cache entries must NOT end up stale (`isInvalidated`) after the
 * builder's onSuccess — the splice is the whole refresh.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(), throwIfNotOk: vi.fn() }));

import {
  roomsQueries,
  createRoomMutationOptions,
  updateRoomMutationOptions,
  type Room,
} from "@/lib/queries/rooms-queries-factory";
import {
  trainingsQueries,
  createClassTypeMutationOptions,
  updateClassTypeMutationOptions,
  type ClassType,
} from "@/lib/queries/trainings-queries-factory";
import {
  packagesQueries,
  createPackageTypeMutationOptions,
  updatePackageTypeMutationOptions,
  type PackageType,
} from "@/lib/queries/packages-queries-factory";
import {
  sessionsQueries,
  createSessionMutationOptions,
  updateSessionMutationOptions,
  type Session,
} from "@/lib/queries/sessions-queries-factory";
import {
  invitesQueries,
  createInviteMutationOptions,
  revokeInviteMutationOptions,
  resendInviteMutationOptions,
  type Invite,
} from "@/lib/queries/invites-queries-factory";

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

/** The observable contract: is this cache entry stale (would refetch)? */
function isStale(key: readonly unknown[]) {
  return client.getQueryState(key)?.isInvalidated === true;
}

// ── rooms ─────────────────────────────────────────────────────────────────
const roomsListKey = roomsQueries.list().queryKey;
function room(id: string, over: Partial<Room> = {}): Room {
  return { id, name: `Room ${id}`, capacity: 10, ...over };
}

describe("rooms cache splice", () => {
  it("create appends the returned room without invalidating", async () => {
    client.setQueryData(roomsListKey, { success: true, rooms: [room("1")] });
    const created = room("2", { name: "Studio B" });

    const observer = new MutationObserver(client, {
      ...createRoomMutationOptions(client),
      mutationFn: async () => ({ success: true, room: created }),
    });
    await observer.mutate({ name: "Studio B", capacity: 10 });

    const list = client.getQueryData<{ rooms: Room[] }>(roomsListKey);
    expect(list?.rooms.map((r) => r.id)).toEqual(["1", "2"]);
    expect(isStale(roomsListKey)).toBe(false);
  });

  it("update replaces the room by id without invalidating", async () => {
    client.setQueryData(roomsListKey, { success: true, rooms: [room("1"), room("2")] });
    const updated = room("1", { name: "Renamed", capacity: 12 });

    const observer = new MutationObserver(client, {
      ...updateRoomMutationOptions(client),
      mutationFn: async () => ({ success: true, room: updated }),
    });
    await observer.mutate({ id: "1", name: "Renamed", capacity: 12 });

    const list = client.getQueryData<{ rooms: Room[] }>(roomsListKey);
    expect(list?.rooms.find((r) => r.id === "1")).toEqual(updated);
    expect(isStale(roomsListKey)).toBe(false);
  });

  it("update invalidates sessions — calendars embed roomName", async () => {
    // A room rename must refetch the session caches (availability/list/byId
    // all carry a server-joined roomName), or calendars keep the old name.
    const availabilityKey = sessionsQueries.availabilityByMonth("2026-01").queryKey;
    client.setQueryData(availabilityKey, { success: true, month: "2026-01", sessions: [] });

    const observer = new MutationObserver(client, {
      ...updateRoomMutationOptions(client),
      mutationFn: async () => ({ success: true, room: room("1", { name: "Renamed" }) }),
    });
    await observer.mutate({ id: "1", name: "Renamed", capacity: 10 });

    expect(isStale(availabilityKey)).toBe(true);
  });
});

// ── trainings (class types) ─────────────────────────────────────────────────
const classTypesKey = trainingsQueries.classTypes().queryKey;
function classType(id: string, over: Partial<ClassType> = {}): ClassType {
  return {
    id,
    name: `Type ${id}`,
    maxClients: 8,
    durationMins: 60,
    trialSessionValue: null,
    ...over,
  };
}

describe("trainings (class types) cache splice", () => {
  it("createClassType appends without invalidating", async () => {
    client.setQueryData(classTypesKey, { success: true, classTypes: [classType("1")] });
    const created = classType("2", { name: "Reformer" });

    const observer = new MutationObserver(client, {
      ...createClassTypeMutationOptions(client),
      mutationFn: async () => ({ success: true, classType: created }),
    });
    await observer.mutate({
      name: "Reformer",
      maxClients: 8,
      durationMins: 60,
      trialSessionValue: 1200,
    });

    const list = client.getQueryData<{ classTypes: ClassType[] }>(classTypesKey);
    expect(list?.classTypes.map((c) => c.id)).toEqual(["1", "2"]);
    expect(isStale(classTypesKey)).toBe(false);
  });

  it("updateClassType invalidates sessions — calendars embed classTypeName", async () => {
    // A class-type rename must refetch the session caches (availability/list/
    // byId all carry a server-joined classTypeName), or calendars keep the
    // old name and color mapping.
    const availabilityKey = sessionsQueries.availabilityByMonth("2026-01").queryKey;
    client.setQueryData(availabilityKey, { success: true, month: "2026-01", sessions: [] });

    const observer = new MutationObserver(client, {
      ...updateClassTypeMutationOptions(client),
      mutationFn: async () => ({
        success: true,
        classType: classType("1", { name: "Renamed" }),
      }),
    });
    await observer.mutate({ id: "1", name: "Renamed" });

    expect(isStale(availabilityKey)).toBe(true);
  });

  it("updateClassType replaces by id without invalidating", async () => {
    client.setQueryData(classTypesKey, {
      success: true,
      classTypes: [classType("1"), classType("2")],
    });
    const updated = classType("1", { name: "Edited", maxClients: 10 });

    const observer = new MutationObserver(client, {
      ...updateClassTypeMutationOptions(client),
      mutationFn: async () => ({ success: true, classType: updated }),
    });
    await observer.mutate({ id: "1", name: "Edited", maxClients: 10 });

    const list = client.getQueryData<{ classTypes: ClassType[] }>(classTypesKey);
    expect(list?.classTypes.find((c) => c.id === "1")).toEqual(updated);
    expect(isStale(classTypesKey)).toBe(false);
  });
});

// ── packages (package types) ────────────────────────────────────────────────
const packageTypesKey = packagesQueries.types().queryKey;
function packageType(id: string, over: Partial<PackageType> = {}): PackageType {
  return {
    id,
    name: `Pkg ${id}`,
    sessionCount: 10,
    validityDays: 30,
    lateCancelHours: 8,
    classTypes: [{ id: "ct1", name: "CT 1" }],
    ...over,
  };
}

describe("packages (package types) cache splice", () => {
  it("createType appends without invalidating", async () => {
    client.setQueryData(packageTypesKey, { success: true, packageTypes: [packageType("1")] });
    const created = packageType("2", { name: "10-pack" });

    const observer = new MutationObserver(client, {
      ...createPackageTypeMutationOptions(client),
      mutationFn: async () => ({ success: true, packageType: created }),
    });
    await observer.mutate({
      name: "10-pack",
      sessionCount: 10,
      validityDays: 30,
      classTypeIds: ["ct1"],
    });

    const list = client.getQueryData<{ packageTypes: PackageType[] }>(packageTypesKey);
    expect(list?.packageTypes.map((p) => p.id)).toEqual(["1", "2"]);
    expect(isStale(packageTypesKey)).toBe(false);
  });

  it("updateType replaces by id (incl. isBirthdayGift) without invalidating", async () => {
    client.setQueryData(packageTypesKey, {
      success: true,
      packageTypes: [packageType("1"), packageType("2")],
    });
    const updated = packageType("1", { name: "Edited", isBirthdayGift: true });

    const observer = new MutationObserver(client, {
      ...updatePackageTypeMutationOptions(client),
      mutationFn: async () => ({ success: true, packageType: updated }),
    });
    await observer.mutate({ id: "1", name: "Edited", isBirthdayGift: true });

    const list = client.getQueryData<{ packageTypes: PackageType[] }>(packageTypesKey);
    expect(list?.packageTypes.find((p) => p.id === "1")).toEqual(updated);
    expect(isStale(packageTypesKey)).toBe(false);
  });
});

// ── sessions ────────────────────────────────────────────────────────────────
const sessionsListKey = sessionsQueries.list().queryKey;
function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    classTypeId: "ct1",
    roomId: "r1",
    trainerUserId: "t1",
    startsAt: "2026-01-01T10:00:00.000Z",
    endsAt: "2026-01-01T11:00:00.000Z",
    capacity: 8,
    status: "SCHEDULED",
    classType: { id: "ct1", name: "Reformer" },
    room: { id: "r1", name: "Studio A" },
    ...over,
  };
}

describe("sessions cache splice", () => {
  it("create appends the returned session to the list without refetching it", async () => {
    client.setQueryData(sessionsListKey, { success: true, sessions: [session("1")] });
    const created = session("2");

    const observer = new MutationObserver(client, {
      ...createSessionMutationOptions(client),
      mutationFn: async () => ({ success: true, session: created }),
    });
    await observer.mutate({
      classTypeId: "ct1",
      trainerUserId: "t1",
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T11:00:00.000Z",
      capacity: 8,
    });

    const list = client.getQueryData<{ sessions: Session[] }>(sessionsListKey);
    expect(list?.sessions.map((s) => s.id)).toEqual(["1", "2"]);
    expect(isStale(sessionsListKey)).toBe(false);
  });

  it("create invalidates availability so the overview calendar refetches", async () => {
    // Regression: the Pregled overview renders from ["sessions","availability",month],
    // not the list cache — a one-off create that only splices the list leaves the
    // calendar stale until app restart.
    const availabilityKey = sessionsQueries.availabilityByMonth("2026-01").queryKey;
    client.setQueryData(availabilityKey, { success: true, month: "2026-01", sessions: [] });

    const observer = new MutationObserver(client, {
      ...createSessionMutationOptions(client),
      mutationFn: async () => ({ success: true, session: session("2") }),
    });
    await observer.mutate({
      classTypeId: "ct1",
      trainerUserId: "t1",
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T11:00:00.000Z",
      capacity: 8,
    });

    expect(isStale(availabilityKey)).toBe(true);
  });

  it("update replaces the session by id in the list; leaves byId detail alone", async () => {
    client.setQueryData(sessionsListKey, {
      success: true,
      sessions: [session("1"), session("2")],
    });
    const updated = session("1", { capacity: 12 });

    const observer = new MutationObserver(client, {
      ...updateSessionMutationOptions(client),
      mutationFn: async () => ({ success: true, session: updated }),
    });
    await observer.mutate({ id: "1", capacity: 12 });

    const list = client.getQueryData<{ sessions: Session[] }>(sessionsListKey);
    expect(list?.sessions.find((s) => s.id === "1")?.capacity).toBe(12);
    expect(isStale(sessionsListKey)).toBe(false);
  });
});

// ── invites ─────────────────────────────────────────────────────────────────
const invitesListKey = invitesQueries.list().queryKey;
function invite(id: string, over: Partial<Invite> = {}): Invite {
  return {
    id,
    email: `u${id}@x.com`,
    firstName: "First",
    lastName: "Last",
    fullName: "First Last",
    phone: null,
    status: "PENDING",
    role: "CLIENT",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("invites cache splice", () => {
  it("create appends the returned invite without invalidating", async () => {
    client.setQueryData(invitesListKey, { success: true, invites: [invite("1")] });
    const created = invite("2", { email: "new@x.com" });

    const observer = new MutationObserver(client, {
      ...createInviteMutationOptions(client),
      mutationFn: async () => ({ success: true, invite: created }),
    });
    await observer.mutate({ email: "new@x.com", firstName: "First", lastName: "Last" });

    const list = client.getQueryData<{ invites: Invite[] }>(invitesListKey);
    expect(list?.invites.map((i) => i.id)).toEqual(["1", "2"]);
    expect(isStale(invitesListKey)).toBe(false);
  });

  it("revoke replaces the invite by id (now REVOKED) without invalidating", async () => {
    client.setQueryData(invitesListKey, {
      success: true,
      invites: [invite("1"), invite("2")],
    });
    const revoked = invite("1", { status: "REVOKED" });

    const observer = new MutationObserver(client, {
      ...revokeInviteMutationOptions(client),
      mutationFn: async () => ({ success: true, invite: revoked }),
    });
    await observer.mutate("1");

    const list = client.getQueryData<{ invites: Invite[] }>(invitesListKey);
    expect(list?.invites.find((i) => i.id === "1")?.status).toBe("REVOKED");
    expect(isStale(invitesListKey)).toBe(false);
  });

  it("resend replaces the invite by id without invalidating", async () => {
    client.setQueryData(invitesListKey, { success: true, invites: [invite("1")] });
    const resent = invite("1", { status: "PENDING" });

    const observer = new MutationObserver(client, {
      ...resendInviteMutationOptions(client),
      mutationFn: async () => ({ success: true, invite: resent }),
    });
    await observer.mutate("1");

    const list = client.getQueryData<{ invites: Invite[] }>(invitesListKey);
    expect(list?.invites.find((i) => i.id === "1")).toEqual(resent);
    expect(isStale(invitesListKey)).toBe(false);
  });
});
