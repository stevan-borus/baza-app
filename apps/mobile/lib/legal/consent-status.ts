import type { ConsentDocumentKey } from "@/generated/prisma";
import { prisma } from "@/lib/server/prisma";
import { ACTIVE_VERSIONS, GATE_DOCUMENT_KEYS_FOR_ROLE } from "./versions";
import { now } from "@/lib/now";

export type PendingDoc = {
  key: ConsentDocumentKey;
  currentVersion: number;
  reason: "missing" | "outdated";
};

export type ConsentStatus = {
  pending: PendingDoc[];
  guardianVerificationNeeded: boolean;
  socialMediaDecided: boolean;
  socialMediaLatestAccepted: boolean | null;
};

export async function getConsentStatus(userId: string): Promise<ConsentStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      clientProfile: {
        select: {
          id: true,
          dateOfBirth: true,
          bookings: {
            where: { session: { status: "COMPLETED" } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const requiredKeys = new Set<ConsentDocumentKey>(
    GATE_DOCUMENT_KEYS_FOR_ROLE[user.role],
  );
  let isMinor = false;
  if (user.role === "CLIENT") {
    // Legacy clients may exist without a recorded DOB; treat as adult for
    // gate purposes (cannot be a minor without a known DOB), but still
    // require waiver_adult so they're prompted to complete it.
    if (user.clientProfile?.dateOfBirth) {
      isMinor = computeIsMinor(user.clientProfile.dateOfBirth);
    }
    requiredKeys.add(isMinor ? "waiver_minor" : "waiver_adult");
  }

  const latestPerKey = await prisma.consentRecord.findMany({
    where: { userId, documentKey: { in: Array.from(requiredKeys) }, accepted: true },
    orderBy: { acceptedAt: "desc" },
    distinct: ["documentKey"],
    select: { documentKey: true, version: true },
  });

  const acceptedByKey = new Map(latestPerKey.map((r) => [r.documentKey, r.version]));

  const socialMediaRecord = await prisma.consentRecord.findFirst({
    where: { userId, documentKey: "social_media" },
    orderBy: { acceptedAt: "desc" },
    select: { accepted: true },
  });
  const socialMediaDecided = socialMediaRecord !== null;
  const socialMediaLatestAccepted = socialMediaRecord?.accepted ?? null;

  const pending: PendingDoc[] = [];
  for (const key of requiredKeys) {
    const accepted = acceptedByKey.get(key);
    const currentVersion = ACTIVE_VERSIONS[key];
    if (accepted === undefined) {
      pending.push({ key, currentVersion, reason: "missing" });
    } else if (accepted < currentVersion) {
      pending.push({ key, currentVersion, reason: "outdated" });
    }
  }

  let guardianVerificationNeeded = false;
  if (
    isMinor &&
    user.clientProfile?.bookings &&
    user.clientProfile.bookings.length > 0
  ) {
    const verified = await prisma.consentRecord.findFirst({
      where: {
        userId,
        documentKey: "waiver_minor",
        accepted: true,
        guardianVerifiedAt: { not: null },
      },
      select: { id: true },
    });
    guardianVerificationNeeded = !verified;
  }

  return {
    pending,
    guardianVerificationNeeded,
    socialMediaDecided,
    socialMediaLatestAccepted,
  };
}

function computeIsMinor(dob: Date): boolean {
  const today = now();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age < 18;
}
