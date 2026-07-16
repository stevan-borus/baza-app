import { UserRole } from "@/generated/prisma";
import {
  healthIntakeInputSchema,
  healthIntakeSuccessResponseSchema,
  healthIntakeWithdrawalResponseSchema,
} from "@baza/types/health-intake";
import { extractEvidence } from "@/lib/legal/evidence";
import { latestIntake, recordIntake, withdrawIntake } from "@/lib/server/health-intake";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const row = await latestIntake(clientProfileId);
  if (!row) return fail("No intake recorded", 404);
  return respond(healthIntakeSuccessResponseSchema, { success: true, ...row });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const parsed = await parseBody(request, healthIntakeInputSchema);
  if (!parsed.ok) return parsed.response;

  const intake = await recordIntake({
    userId: guard.user.id,
    clientProfileId,
    input: parsed.data,
    evidence: extractEvidence(request),
  });
  return respond(healthIntakeSuccessResponseSchema, {
    success: true,
    ...intake,
  });
}

export async function DELETE(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const audit = await withdrawIntake(clientProfileId);
  return respond(healthIntakeWithdrawalResponseSchema, {
    success: true,
    ...audit,
  });
}
