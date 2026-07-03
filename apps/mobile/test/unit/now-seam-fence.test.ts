/**
 * Convention fence for the anchor-time seam: every "what time is it" read in
 * client product code must go through now() / nowMs() from lib/now.ts — see
 * CONTEXT.md → "Anchor time".
 *
 * An argless `new Date()` or a `Date.now()` bypasses the TEST_ANCHOR_TIME
 * pin, so date-dependent behaviour drifts with wall-clock time in tests.
 * Each legitimate exception (e.g. real elapsed-time measurement for
 * animations/spinners, where a frozen anchor would break the maths) must be
 * annotated with a `// now-exempt: <reason>` comment on the same or the
 * preceding line. An unannotated call fails this test — new code can't
 * silently opt out of the seam.
 *
 * Scope: app/** (minus app/api — server routes are fenced by convention in
 * lib/server), components/**, lib/** (minus lib/server and lib/now.ts, the
 * seam itself). Test files are out of scope.
 *
 * `new Date(value)` — parsing/constructing from an explicit value — is fine
 * and intentionally not matched.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MOBILE_ROOT = path.resolve(__dirname, "../..");

const SCAN_ROOTS = ["app", "components", "lib"];

const SKIP_DIRS = new Set([
  path.join(MOBILE_ROOT, "app", "api"),
  path.join(MOBILE_ROOT, "lib", "server"),
]);

const SKIP_FILES = new Set([path.join(MOBILE_ROOT, "lib", "now.ts")]);

// Argless call only — `new Date(x)` / `Date.now.bind(...)` etc. don't match.
const WALL_CLOCK_PATTERNS = [/\bnew Date\(\s*\)/, /\bDate\.now\(\s*\)/];

function isSourceFile(name: string): boolean {
  if (name.endsWith(".d.ts")) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(name)) return false;
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(full) || entry.name === "node_modules") continue;
      out.push(...collectSourceFiles(full));
    } else if (isSourceFile(entry.name) && !SKIP_FILES.has(full)) {
      out.push(full);
    }
  }
  return out;
}

describe("now seam fence", () => {
  it("every argless new Date() / Date.now() in client code goes through @/lib/now or carries a now-exempt annotation", () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(path.join(MOBILE_ROOT, root))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!WALL_CLOCK_PATTERNS.some((p) => p.test(line))) return;
          const annotated =
            line.includes("now-exempt:") ||
            (i > 0 && lines[i - 1]?.includes("now-exempt:") === true);
          if (!annotated) {
            violations.push(`${path.relative(MOBILE_ROOT, file)}:${i + 1}`);
          }
        });
      }
    }
    expect(
      violations,
      `Argless new Date() / Date.now() bypasses the anchor-time seam ` +
        `(lib/now.ts). Import { now, nowMs } from "@/lib/now" instead, or — ` +
        `for a genuine wall-clock need such as elapsed-time measurement — ` +
        `annotate the line (or the line above) with ` +
        `\`// now-exempt: <reason>\`. Violations:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
