import { now } from "@/lib/now";
import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import { requireCronAuth } from "@/lib/server/cron-auth";
import { ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const cron = requireCronAuth(request);
  if (!cron.ok) return cron.response;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now() } },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
  });
  if (dryRun) return ok({ success: true, dryRun, dispatched: due.length });
  let dispatched = 0;
  for (const c of due) {
    await dispatchCampaign(c.id);
    dispatched += 1;
  }
  return ok({ success: true, dryRun, dispatched });
}
