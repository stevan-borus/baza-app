import { healthResponseSchema } from "@baza/types/system";
import { now } from "@/lib/now";
import { respond } from "@/lib/server/http";

export async function GET() {
  return respond(healthResponseSchema, {
    success: true,
    service: "baza-api",
    status: "ok",
    ts: now().toISOString(),
  });
}
