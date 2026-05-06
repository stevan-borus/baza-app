import { readCapturedResetTokenForE2E } from "../../lib/server/e2e-reset-token-capture";

async function main() {
  const email = process.argv[2]?.trim();

  if (!email) {
    console.error("Usage: tsx scripts/test/get-latest-reset-token.ts <email>");
    process.exitCode = 1;
    return;
  }

  const captured = await readCapturedResetTokenForE2E(email);

  if (!captured) {
    console.error(`[reset-token] No captured token found for ${email}`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(captured.token);
}

void main();
