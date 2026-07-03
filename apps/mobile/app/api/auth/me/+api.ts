import { authMeResponseSchema } from "@baza/types/auth";
import { getRequestUser } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return fail("Unauthorized", 401);
  return respond(authMeResponseSchema, { success: true, user });
}
