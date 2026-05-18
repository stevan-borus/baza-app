import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/legal/documents/[key]+api";

function request(key: string, locale: string): Request {
  return new Request(`https://t.local/api/legal/documents/${key}?locale=${locale}`);
}

describe("GET /api/legal/documents/:key", () => {
  it("returns markdown for tos sr v1", async () => {
    const res = await GET(request("tos", "sr"), { params: { key: "tos" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.key).toBe("tos");
    expect(body.version).toBe(1);
    expect(body.locale).toBe("sr");
    expect(body.body).toContain("Uslovi korišćenja");
  });

  it("returns markdown for tos en v1", async () => {
    const res = await GET(request("tos", "en"), { params: { key: "tos" } });
    const body = await res.json();
    expect(body.locale).toBe("en");
    expect(body.body).toContain("Terms of Service");
  });

  it("404 for unknown key", async () => {
    const res = await GET(request("not_a_doc", "sr"), { params: { key: "not_a_doc" } });
    expect(res.status).toBe(404);
  });

  it("400 for missing locale", async () => {
    const req = new Request(`https://t.local/api/legal/documents/tos`);
    const res = await GET(req, { params: { key: "tos" } });
    expect(res.status).toBe(400);
  });
});
