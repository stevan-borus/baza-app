import { auth } from "@/lib/server/auth";
import { getRequestUser } from "@/lib/server/auth-guards";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (user) {
    await prisma.pushToken.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });
  }

  return auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });
}
