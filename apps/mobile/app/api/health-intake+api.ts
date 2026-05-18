import { UserRole } from "@/generated/prisma";
import { healthIntakeInputSchema } from "@baza/types";
import { extractEvidence } from "@/lib/legal/evidence";
import { latestIntake, recordIntake, withdrawIntake } from "@/lib/server/health-intake";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const row = await latestIntake(clientProfileId);
  if (!row) return fail("No intake recorded", 404);
  return ok({ success: true, ...row });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const body = await request.json().catch(() => null);
  const parsed = healthIntakeInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const intake = await recordIntake({
    userId: guard.user.id,
    clientProfileId,
    input: parsed.data,
    evidence: extractEvidence(request),
  });
  return ok({ success: true, ...intake });
}

export async function DELETE(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const audit = await withdrawIntake(clientProfileId);
  return ok({ success: true, ...audit });
}
