import { campaignAudienceSpecSchema } from "@baza/types";
import { resolveLocale } from "@baza/i18n";
import { now } from "@/lib/now";
import { env } from "@/lib/server/env";
import { signUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";
import { resolveCampaignAudience } from "@/lib/server/campaign-audience";
import { CAMPAIGN_SELECT } from "@/lib/server/campaign-select";
import { createAndDispatchUserNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { sendCampaignEmail } from "@/lib/server/resend";

const CHROME = {
  sr: { unsubscribeText: "Odjavite se", footerNote: "Novosti i ponude studija Baza Pilates. Ne želite ovo?" },
  en: { unsubscribeText: "Unsubscribe", footerNote: "News and offers from Baza Pilates. Don't want these?" },
} as const;

// How many recipients to fan out to concurrently. Bounds the in-flight DB/push/
// email work so a large audience doesn't open hundreds of simultaneous sockets,
// while still finishing far faster than a fully serial loop.
const FANOUT_CHUNK = 25;

type Recipient = {
  id: string;
  email: string | null;
  notificationPreference: { preferredLocale: string | null } | null;
};

async function deliverToRecipient(
  r: Recipient,
  campaign: { id: string; title: string; body: string },
) {
  await createAndDispatchUserNotification({
    userId: r.id,
    type: "CAMPAIGN",
    title: campaign.title,
    body: campaign.body,
    campaignId: campaign.id,
    payload: { campaignId: campaign.id },
  });

  if (r.email) {
    const locale = resolveLocale(r.notificationPreference?.preferredLocale);
    const unsubscribeUrl = `${env.APP_WEB_URL}/api/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(r.id))}`;
    await sendCampaignEmail({
      to: r.email,
      subject: campaign.title,
      bodyText: campaign.body,
      unsubscribeUrl,
      chrome: CHROME[locale],
    });
  }
}

/**
 * Resolves the campaign's audience AT DISPATCH TIME, filters to clients with
 * campaignsEnabled, fans out in-app + push + email (each gated), stamps SENT
 * with recipientCount.
 *
 * Idempotency is enforced HERE, not left to callers: the first thing we do is
 * an atomic compare-and-set claim (DRAFT/SCHEDULED -> SENDING). A second caller
 * — an overlapping cron tick, or "Send now" racing the cron — loses the claim
 * (updateMany count 0) and no-ops, so the audience is never delivered twice
 * (campaign notifications carry no dedupeKey, so the claim is the only guard).
 *
 * Each recipient is delivered inside its own error boundary and in bounded-
 * concurrency chunks, so one failing email/push neither aborts the rest of the
 * audience nor leaves the campaign stuck un-stamped.
 */
export async function dispatchCampaign(campaignId: string) {
  // Atomic claim: only a DRAFT or SCHEDULED campaign can transition to SENDING,
  // and only one caller's updateMany will match (the row is no longer in that
  // state for the loser). This is the chokepoint that prevents a double-send.
  const claim = await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "SENDING" },
  });
  if (claim.count === 0) {
    // Already SENDING or SENT — another dispatcher owns (or finished) this one.
    return prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: CAMPAIGN_SELECT });
  }

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, title: true, body: true, audienceSpec: true },
  });

  const spec = campaignAudienceSpecSchema.parse(campaign.audienceSpec);
  const candidateIds = await resolveCampaignAudience(spec);

  // Marketing opt-out is mandatory: only campaignsEnabled clients receive
  // ANYTHING. createAndDispatchUserNotification gates push on pushEnabled but
  // knows nothing about campaignsEnabled, so filter here first. preferredLocale
  // rides along so the per-recipient email chrome localizes with no extra query.
  const recipients = await prisma.user.findMany({
    where: { id: { in: candidateIds }, notificationPreference: { is: { campaignsEnabled: true } } },
    select: {
      id: true,
      email: true,
      notificationPreference: { select: { preferredLocale: true } },
    },
  });

  // Fan out in bounded-concurrency chunks, each recipient isolated: a thrown
  // push/email for one client must not abort delivery to the others (and the
  // campaign must still reach SENT below).
  for (let i = 0; i < recipients.length; i += FANOUT_CHUNK) {
    const chunk = recipients.slice(i, i + FANOUT_CHUNK);
    await Promise.allSettled(chunk.map((r) => deliverToRecipient(r, campaign)));
  }

  return prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "SENT", sentAt: now(), recipientCount: recipients.length },
    select: CAMPAIGN_SELECT,
  });
}
