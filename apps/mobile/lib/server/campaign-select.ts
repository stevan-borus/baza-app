import { Prisma } from "@/generated/prisma";

/**
 * The single campaign shape every single-campaign API response returns, so the
 * client query factory parses one consistent object regardless of whether the
 * campaign came from GET, create, edit, or a just-dispatched send/sendNow.
 */
export const CAMPAIGN_SELECT = {
  id: true,
  title: true,
  body: true,
  audienceSpec: true,
  recipientCount: true,
  status: true,
  scheduledFor: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.CampaignSelect;
