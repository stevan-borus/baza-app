import { inviteClientInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  // Trainers see only clients with active bookings in their sessions.
  const clients = await prisma.clientProfile.findMany({
    where:
      guard.user.role === UserRole.TRAINER
        ? {
            bookings: {
              some: {
                canceledAt: null,
                session: {
                  trainerUserId: guard.user.id,
                },
              },
            },
          }
        : undefined,
    select: {
      id: true,
      notes: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return ok({ success: true, clients });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = inviteClientInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const { email, fullName, phone } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  // Creates user and linked clientProfile; admin-only.
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      phone,
      role: "CLIENT",
      isActive: true,
      clientProfile: {
        create: {},
      },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      clientProfile: { select: { id: true } },
    },
  });

  return ok({ success: true, user }, 201);
}
