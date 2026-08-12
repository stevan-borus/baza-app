import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("resend", () => {
  class FakeResend {
    emails = {
      send: vi.fn().mockResolvedValue({ id: "test-email-id" }),
    };
  }
  return { Resend: FakeResend };
});

vi.mock("@react-email/render", () => ({
  render: vi.fn().mockResolvedValue("<html><body>invite</body></html>"),
}));

describe("sendInviteEmail", () => {
  const originalCapturePath = process.env.E2E_INVITE_TOKEN_FILE;
  let capturePath: string;

  beforeEach(() => {
    capturePath = join(
      tmpdir(),
      `baza-invite-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    process.env.E2E_INVITE_TOKEN_FILE = capturePath;
    vi.resetModules();
  });

  afterEach(async () => {
    process.env.E2E_INVITE_TOKEN_FILE = originalCapturePath;
    await rm(capturePath, { force: true });
  });

  it("captures the raw invite token for E2E runs", async () => {
    const { sendInviteEmail } = await import("@/lib/server/resend");
    const { readCapturedInviteTokenForE2E } = await import(
      "@/lib/server/e2e-invite-token-capture"
    );

    await sendInviteEmail({
      to: "new.trainer@example.test",
      firstName: "Nova",
      lastName: "Trenerka",
      inviteToken: "raw-invite-token-123",
    });

    const captured = JSON.parse(await readFile(capturePath, "utf8")) as {
      email: string;
      token: string;
    };

    expect(captured).toMatchObject({
      email: "new.trainer@example.test",
      token: "raw-invite-token-123",
    });

    await expect(
      readCapturedInviteTokenForE2E("new.trainer@example.test"),
    ).resolves.toMatchObject({
      email: "new.trainer@example.test",
      token: "raw-invite-token-123",
    });
  });

  it("writes nothing when the E2E capture path is unset", async () => {
    // The gate is the presence of the env var and nothing else — a deployment
    // that never sets it can never persist a live invite token to disk.
    delete process.env.E2E_INVITE_TOKEN_FILE;

    const { sendInviteEmail } = await import("@/lib/server/resend");
    const { readCapturedInviteTokenForE2E } = await import(
      "@/lib/server/e2e-invite-token-capture"
    );

    await sendInviteEmail({
      to: "ungated.trainer@example.test",
      firstName: "Ne",
      lastName: "Hvata",
      inviteToken: "must-not-be-written",
    });

    await expect(readFile(capturePath, "utf8")).rejects.toThrow();
    await expect(
      readCapturedInviteTokenForE2E("ungated.trainer@example.test"),
    ).resolves.toBeNull();
  });
});
