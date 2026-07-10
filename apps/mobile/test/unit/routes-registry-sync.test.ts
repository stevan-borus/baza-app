import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectRouteKeys } from "../../scripts/gen-api-registry";

// Guards against the classic drift: someone adds server/routes/foo.ts and forgets
// to run `pnpm gen:api-registry`, so the catch-all never dispatches to it.
//
// We parse the checked-in registry FILE's import paths and compare that set to
// the route files on disk. Parsing text (rather than importing the registry
// module) keeps this a structural check — importing it would eagerly pull in
// every handler's Prisma/env graph and need a full server env just to run.
// It's also formatting-agnostic (oxfmt may drop quotes on table keys), so it
// asserts the SET of routes, not byte layout.
describe("routes-registry is in sync with server/routes/**", () => {
  const registryPath = path.resolve(
    import.meta.dirname,
    "../../server/routes-registry.ts",
  );
  const content = readFileSync(registryPath, "utf8");

  /** Keys the registry imports, derived from `... from "@/server/routes/<key>"`. */
  function registeredKeys(): string[] {
    const re = /from "@\/server\/routes\/(.+?)";/g;
    const keys: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) keys.push(m[1]);
    return keys;
  }

  it("registers exactly the route files on disk — no missing, no extra", () => {
    const onDisk = collectRouteKeys().sort();
    const registered = registeredKeys().sort();

    const missing = onDisk.filter((k) => !registered.includes(k));
    const extra = registered.filter((k) => !onDisk.includes(k));

    expect(
      missing,
      `Route files missing from routes-registry.ts — run \`pnpm gen:api-registry\`:\n${missing.join("\n")}`,
    ).toEqual([]);
    expect(
      extra,
      `routes-registry.ts references routes that no longer exist — run \`pnpm gen:api-registry\`:\n${extra.join("\n")}`,
    ).toEqual([]);
  });

  it("has one table entry per imported route (import ↔ table in sync)", () => {
    const importCount = registeredKeys().length;
    // Table entries look like `<key>: route_xxx,` (key may or may not be quoted).
    const entryCount = (content.match(/:\s*route_[A-Za-z0-9_]+,/g) ?? []).length;
    expect(entryCount).toBe(importCount);
  });
});
