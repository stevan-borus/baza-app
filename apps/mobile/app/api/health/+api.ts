import { ok } from "@/lib/server/http";

export async function GET() {
  return ok({
    success: true,
    service: "baza-api",
    status: "ok",
    ts: new Date().toISOString(),
  });
}
