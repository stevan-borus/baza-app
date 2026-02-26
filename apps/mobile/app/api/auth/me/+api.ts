import { getRequestUser } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return fail("Unauthorized", 401);
  return ok({ success: true, user });
}
