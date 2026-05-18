import { extractEvidence } from "@/lib/legal/evidence";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import type { HealthIntakeInput } from "@baza/types";
import { prisma } from "./prisma";

type RecordIntakeArgs = {
  userId: string;
  clientProfileId: string;
  input: HealthIntakeInput;
  evidence: ReturnType<typeof extractEvidence>;
  recordedByUserId?: string | null; // null = self-recorded
};

export async function recordIntake(args: RecordIntakeArgs) {
  return prisma.$transaction(async (tx) => {
    const intake = await tx.clientHealthIntake.create({
      data: {
        clientProfileId: args.clientProfileId,
        isPhysicallyActive: args.input.isPhysicallyActive,
        isFirstPilates: args.input.isFirstPilates,
        hasComplaints: args.input.hasComplaints,
        complaintsDetails: args.input.complaintsDetails ?? null,
        hasInjuries: args.input.hasInjuries,
        injuriesDetails: args.input.injuriesDetails ?? null,
        isPregnant: args.input.isPregnant,
        isPostpartum: args.input.isPostpartum,
        guardianName: args.input.guardianName ?? null,
        guardianRelation: args.input.guardianRelation ?? null,
        recordedByUserId: args.recordedByUserId ?? null,
      },
    });
    await tx.consentRecord.create({
      data: {
        userId: args.userId,
        documentKey: "health_intake",
        version: ACTIVE_VERSIONS.health_intake,
        // requireRole's getRequestUser doesn't select preferredLocale;
        // hardcode sr (spec default) until that field is plumbed through.
        locale: "sr",
        accepted: true,
        ipAddress: args.evidence.ipAddress,
        userAgent: args.evidence.userAgent,
        appVersion: args.evidence.appVersion,
      },
    });
    return intake;
  });
}

export async function withdrawIntake(clientProfileId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.clientHealthIntake.deleteMany({ where: { clientProfileId } });
    const audit = await tx.healthIntakeWithdrawal.create({
      data: { clientProfileId },
    });
    return audit;
  });
}

export async function latestIntake(clientProfileId: string) {
  return prisma.clientHealthIntake.findFirst({
    where: { clientProfileId },
    orderBy: { recordedAt: "desc" },
  });
}
