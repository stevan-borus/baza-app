/**
 * Unit tests for the response-contract seam (lib/server/http.ts respond()) —
 * the server-side end of the @baza/types wire contract. A route hands
 * respond() its payload plus the response schema the client will parse
 * against; outside production the payload's wire form is validated so
 * select↔schema drift (the #86 class) fails loudly in dev and in the
 * integration suite instead of surfacing as a raw ZodError in the client UI.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { respond } from "@/lib/server/http";

const sessionSchema = z.object({
  success: z.boolean(),
  session: z.object({
    id: z.string(),
    trainerUserId: z.string(),
  }),
});

describe("respond", () => {
  it("returns the payload as JSON with the given status when it matches the schema", async () => {
    const payload = {
      success: true,
      session: { id: "s1", trainerUserId: "t1" },
    };

    const response = respond(sessionSchema, payload, 201);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(payload);
  });

  it("throws a contract violation when the payload is missing a schema field (the #86 class)", () => {
    // The POST /api/sessions select once omitted trainerUserId; the schema
    // required it. That drift must fail here, not in the client's parse.
    const payload = { success: true, session: { id: "s1" } };

    expect(() => respond(sessionSchema, payload)).toThrow(
      /Response contract violation/,
    );
  });

  it("validates the wire form: Date payloads satisfy string-dated schemas", async () => {
    // Routes hand respond() Prisma rows carrying Date objects; the client
    // parses JSON carrying ISO strings. Validation must see what the client
    // sees, so schemas typed z.string()/z.iso.datetime() accept Date payloads.
    const schema = z.object({
      success: z.boolean(),
      session: z.object({ id: z.string(), startsAt: z.iso.datetime() }),
    });
    const payload = {
      success: true,
      session: { id: "s1", startsAt: new Date("2026-05-11T09:00:00Z") },
    };

    const response = respond(schema, payload);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.startsAt).toBe("2026-05-11T09:00:00.000Z");
  });

  it("never rejects fields the schema does not declare (under-selection only)", async () => {
    // Deliberate, permanent scope: respond() guards the #86 class (missing /
    // mistyped fields). Over-selection — a route select returning MORE than
    // the schema declares — is owned by code review, not this seam.
    const payload = {
      success: true,
      session: { id: "s1", trainerUserId: "t1", roomName: "Sala 1" },
      extraTopLevel: true,
    };

    const response = respond(sessionSchema, payload);

    // The undeclared fields also pass through to the wire untouched.
    expect(await response.json()).toEqual(payload);
  });

  it("skips validation entirely in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const payload = { success: true, session: { id: "s1" } };

    const response = respond(sessionSchema, payload);

    expect(await response.json()).toEqual(payload);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
