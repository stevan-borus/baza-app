import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const adminRoot = resolve(__dirname, "../../app/(admin)");

// Source of truth for the (admin)/ route shape (Model A, Phase 1).
// Update when adding or removing routes — adding a file without listing it
// here means it's untracked by this guardrail, not "already covered".
const required = [
  "_layout.tsx",
  "pregled/_layout.tsx",
  "pregled/index.tsx",
  "pregled/sessions/[id].tsx",
  "klijenti/_layout.tsx",
  "klijenti/index.tsx",
  "klijenti/[id]/index.tsx",
  "klijenti/[id]/istorija.tsx",
  "klijenti/sessions/[id].tsx",
  "naplata/_layout.tsx",
  "naplata/index.tsx",
  "izvestaji/_layout.tsx",
  "izvestaji/index.tsx",
  "izvestaji/aktivne-dodele.tsx",
  "katalog/_layout.tsx",
  "katalog/tipovi-treninga.tsx",
  "katalog/sale.tsx",
  "katalog/tipovi-paketa.tsx",
];

const forbidden = [
  "index.tsx",
  "clients.tsx",
  "billing.tsx",
  "reports.tsx",
  "class-types.tsx",
  "rooms.tsx",
  "sessions/[id].tsx",
  "sessions/_layout.tsx",
  "packages/index.tsx",
  "packages/active-assignments.tsx",
  "packages/_layout.tsx",
];

describe("admin route shape (Model A)", () => {
  test.each(required)("exists: %s", (rel) => {
    expect(existsSync(resolve(adminRoot, rel))).toBe(true);
  });

  test.each(forbidden)("must not exist: %s", (rel) => {
    expect(existsSync(resolve(adminRoot, rel))).toBe(false);
  });
});
