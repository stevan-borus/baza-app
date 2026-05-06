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
  render: vi.fn().mockResolvedValue("<html><body>reset</body></html>"),
}));

describe("sendResetEmail", () => {
  const originalCapturePath = process.env.E2E_RESET_TOKEN_FILE;
  let capturePath: string;

  beforeEach(() => {
    capturePath = join(
      tmpdir(),
      `baza-password-reset-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    process.env.E2E_RESET_TOKEN_FILE = capturePath;
    vi.resetModules();
  });

  afterEach(async () => {
    process.env.E2E_RESET_TOKEN_FILE = originalCapturePath;
    await rm(capturePath, { force: true });
  });

  it("captures the raw reset token for E2E runs", async () => {
    const { sendResetEmail } = await import("@/lib/server/resend");
    const { readCapturedResetTokenForE2E } = await import(
      "@/lib/server/e2e-reset-token-capture"
    );

    await sendResetEmail({
      to: "client.e2e@example.test",
      resetToken: "raw-reset-token-123",
    });

    const captured = JSON.parse(await readFile(capturePath, "utf8")) as {
      email: string;
      token: string;
    };

    expect(captured).toMatchObject({
      email: "client.e2e@example.test",
      token: "raw-reset-token-123",
    });

    await expect(
      readCapturedResetTokenForE2E("client.e2e@example.test"),
    ).resolves.toMatchObject({
      email: "client.e2e@example.test",
      token: "raw-reset-token-123",
    });
  });
});
