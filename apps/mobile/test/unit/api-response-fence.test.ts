/**
 * Convention fence for the wire-contract seam: every JSON success path in
 * app/api must go through respond(schema, payload) — see lib/server/http.ts.
 *
 * A raw `Response.json(` in a route bypasses the contract validation, so each
 * remaining use (4xx/5xx error payloads whose shape is not a success
 * contract) must be annotated with a `// contract-exempt: <reason>` comment
 * on the same or the preceding line. An unannotated call fails this test —
 * new routes can't silently opt out of the seam.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.resolve(__dirname, "../../app/api");

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry.name.endsWith("+api.ts")) out.push(full);
  }
  return out;
}

describe("api response fence", () => {
  it("every Response.json( in app/api carries a contract-exempt annotation", () => {
    const violations: string[] = [];
    for (const file of collectRouteFiles(API_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("Response.json(")) return;
        const annotated =
          line.includes("contract-exempt:") ||
          (i > 0 && lines[i - 1]?.includes("contract-exempt:") === true);
        if (!annotated) {
          violations.push(`${path.relative(API_ROOT, file)}:${i + 1}`);
        }
      });
    }
    expect(
      violations,
      `Raw Response.json( bypasses respond() contract validation. Either ` +
        `route the success payload through respond(schema, payload), or — ` +
        `for a non-success payload — annotate the line (or the line above) ` +
        `with \`// contract-exempt: <reason>\`. Violations:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
