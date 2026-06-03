import { campaignAudienceSpecSchema } from "@baza/types";
import { now } from "@/lib/now";
import { env } from "@/lib/server/env";
import { signUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";
import { resolveCampaignAudience } from "@/lib/server/campaign-audience";
import { createAndDispatchUserNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { sendCampaignEmail } from "@/lib/server/resend";

const CHROME = {
  sr: { headerLabel: "Promocije / novi programi", unsubscribeText: "Odjavi se", footerNote: "Ovu poruku ste dobili jer ste klijent Baza Pilates studija." },
  en: { headerLabel: "Promotions / new programs", unsubscribeText: "Unsubscribe", footerNote: "You received this because you are a Baza Pilates client." },
} as const;

/**
 * Resolves the campaign's audience AT DISPATCH TIME, filters to clients with
 * campaignsEnabled, fans out in-app + push + email (each gated), stamps SENT
 * with recipientCount. Idempotency is the caller's concern (routes only
 * dispatch DRAFT/SCHEDULED).
 */
export async function dispatchCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, title: true, body: true, audienceSpec: true },
  });

  const spec = campaignAudienceSpecSchema.parse(campaign.audienceSpec);
  const candidateIds = await resolveCampaignAudience(spec);

  // Marketing opt-out is mandatory: only campaignsEnabled clients receive
  // ANYTHING. createAndDispatchUserNotification gates push on pushEnabled but
  // knows nothing about campaignsEnabled, so filter here first. We also pull
  // preferredLocale from the same join (the email chrome localizes per
  // recipient) to avoid a per-recipient locale query in the loop.
  const recipients = await prisma.user.findMany({
    where: { id: { in: candidateIds }, notificationPreference: { is: { campaignsEnabled: true } } },
    select: {
      id: true,
      email: true,
      notificationPreference: { select: { preferredLocale: true } },
    },
  });

  // NOTE: campaign notifications carry no dedupeKey, so this fan-out is not
  // idempotent. Routes only dispatch a DRAFT/SCHEDULED campaign once and stamp
  // it SENT after the loop; if a future retry-on-partial-failure path is added,
  // it must dedupe to avoid double-sending the already-delivered prefix.
  for (const r of recipients) {
    await createAndDispatchUserNotification({
      userId: r.id,
      type: "CAMPAIGN",
      title: campaign.title,
      body: campaign.body,
      campaignId: campaign.id,
      payload: { campaignId: campaign.id },
    });

    if (r.email) {
      const locale = r.notificationPreference?.preferredLocale === "en" ? "en" : "sr";
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

  return prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "SENT", sentAt: now(), recipientCount: recipients.length },
    select: { id: true, status: true, sentAt: true, recipientCount: true },
  });
}
