import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { now } from "@/lib/now";
import { tryCatch } from "@/lib/server/try-catch";

export type CapturedInviteToken = {
  email: string;
  token: string;
  capturedAt: string;
};

function getCaptureFilePath() {
  const configuredPath = process.env.E2E_INVITE_TOKEN_FILE?.trim();
  if (!configuredPath) return null;

  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);
}

export function isE2EInviteTokenCaptureEnabled() {
  return getCaptureFilePath() !== null;
}

/**
 * Stores the latest raw invite token for E2E-only flows that need to complete
 * the invite journey without depending on an external email inbox.
 */
export async function captureInviteTokenForE2E(params: {
  email: string;
  token: string;
}) {
  const captureFilePath = getCaptureFilePath();
  if (!captureFilePath) return;

  const mkdirResult = await tryCatch(
    mkdir(dirname(captureFilePath), { recursive: true }),
  );
  if (mkdirResult.error) {
    console.error("[invite-token-capture:mkdir-error]", mkdirResult.error);
    return;
  }

  const writeResult = await tryCatch(
    writeFile(
      captureFilePath,
      JSON.stringify(
        {
          email: params.email,
          token: params.token,
          capturedAt: now().toISOString(),
        } satisfies CapturedInviteToken,
        null,
        2,
      ),
      "utf8",
    ),
  );

  if (writeResult.error) {
    console.error("[invite-token-capture:write-error]", writeResult.error);
  }
}

export async function readCapturedInviteTokenForE2E(email: string) {
  const captureFilePath = getCaptureFilePath();
  if (!captureFilePath) return null;

  const fileResult = await tryCatch(readFile(captureFilePath, "utf8"));
  if (fileResult.error) return null;

  const parsedResult = await tryCatch(
    Promise.resolve(JSON.parse(fileResult.data) as CapturedInviteToken),
  );
  if (parsedResult.error) return null;

  return parsedResult.data.email === email ? parsedResult.data : null;
}
