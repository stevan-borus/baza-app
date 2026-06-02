import { formatFullName } from "@baza/types";
import { UserRole, NotificationType } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { ok } from "@/lib/server/http";
import { createAndDispatchUserNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

/**
 * Records a user's refusal of the legal gate and notifies every admin.
 * The client is responsible for the actual sign-out flow (calls
 * `signOutWithPushCleanup`) immediately after a 200 from this endpoint.
 */
export async function POST(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const user = await prisma.user.findUnique({
    where: { id: guard.user.id },
    select: { firstName: true, lastName: true },
  });
  const userName = user ? formatFullName(user.firstName, user.lastName) : "Korisnik";

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      createAndDispatchUserNotification({
        userId: admin.id,
        type: NotificationType.CONSENT_REFUSED,
        title: `${userName} nije prihvatio dokumente`,
        body: `${userName} je odbio/la pravne dokumente i odjavljen/a je.`,
        payload: {
          messageKey: "notif.consentRefused",
          userName: user ? formatFullName(user.firstName, user.lastName) : "",
        },
      }),
    ),
  );

  return ok({ success: true });
}
