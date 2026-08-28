#!/usr/bin/env node
/**
 * Publish an OTA update with the same env the matching build profile uses.
 *
 * `eas update` does NOT read the `env` block in eas.json — that block only
 * applies to `eas build`. Its `--environment` flag pulls *server-side* vars
 * from the EAS dashboard, which is a different store, and ours holds only
 * SENTRY_AUTH_TOKEN. So an update published without help inherits none of the
 * EXPO_PUBLIC_* values and ships an app pointing at whatever the bundler
 * defaulted to — silently, because nothing fails at publish time. That is how
 * a staging OTA ends up talking to no API at all.
 *
 * This reads the profile's env straight out of eas.json and passes it inline,
 * so the update and the build it lands on can't disagree.
 *
 *   node scripts/ota-update.mjs <profile> --message "..."
 *
 * Extra args are forwarded to `eas update` untouched.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The channel a build listens on is set by `channel` in its profile, so the
// update must target that same name. profile → channel is not always identity
// (preview-ios extends preview and shares its channel), which is exactly the
// mapping worth reading from the file rather than assuming.
function resolveProfile(easJson, profileName) {
  const profile = easJson.build?.[profileName];
  if (!profile) {
    const known = Object.keys(easJson.build ?? {}).join(", ");
    throw new Error(`Unknown build profile "${profileName}". Known: ${known}`);
  }

  // `extends` chains carry both env and channel down; walk to the root so an
  // inheriting profile publishes with its parent's settings.
  const chain = [];
  let cursor = profileName;
  while (cursor) {
    if (chain.includes(cursor)) {
      throw new Error(`Circular "extends" in eas.json at "${cursor}"`);
    }
    chain.push(cursor);
    cursor = easJson.build[cursor]?.extends;
  }

  // Nearest definition wins, so fold from the root outwards.
  let env = {};
  let channel;
  for (const name of chain.reverse()) {
    env = { ...env, ...(easJson.build[name].env ?? {}) };
    channel = easJson.build[name].channel ?? channel;
  }
  return { env, channel };
}

const [profileName, ...forwarded] = process.argv.slice(2);
if (!profileName) {
  console.error("Usage: node scripts/ota-update.mjs <profile> [eas update args]");
  process.exit(1);
}

const easJson = JSON.parse(
  readFileSync(resolve(mobileRoot, "eas.json"), "utf8"),
);
const { env, channel } = resolveProfile(easJson, profileName);

if (!channel) {
  throw new Error(
    `Profile "${profileName}" has no "channel", so there is no branch to publish to. ` +
      `Builds without a channel can't receive updates at all.`,
  );
}

const publicVars = Object.keys(env).filter((k) => k.startsWith("EXPO_PUBLIC_"));
if (publicVars.length === 0) {
  throw new Error(
    `Profile "${profileName}" defines no EXPO_PUBLIC_* env, which would ship an ` +
      `update with no API URL. Refusing to publish.`,
  );
}

console.log(`Publishing to channel "${channel}" with: ${publicVars.join(", ")}`);

execFileSync(
  "pnpm",
  [
    "dlx",
    "eas-cli",
    "update",
    "--branch",
    channel,
    // Required in non-interactive mode on SDK 55+. Pulls server-side vars
    // (SENTRY_AUTH_TOKEN); the EXPO_PUBLIC_* ones come from env below.
    "--environment",
    profileName === "preview-ios" ? "preview" : profileName,
    ...forwarded,
  ],
  { cwd: mobileRoot, stdio: "inherit", env: { ...process.env, ...env } },
);
