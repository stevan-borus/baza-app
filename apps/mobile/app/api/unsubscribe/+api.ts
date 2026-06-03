import { verifyUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";
import { prisma } from "@/lib/server/prisma";

const PAGE = {
  sr: { title: "Odjava uspešna", msg: "Više nećete primati promotivne poruke od Baza Pilates studija." },
  en: { title: "Unsubscribed", msg: "You will no longer receive promotional messages from Baza Pilates." },
  error: { sr: "Link za odjavu je nevažeći.", en: "This unsubscribe link is invalid." },
} as const;

function html(status: number, lang: "sr" | "en", title: string, msg: string) {
  return new Response(
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#fdf7f4;margin:0;padding:48px 16px;text-align:center"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><h1 style="color:#2e5b42;font-size:20px">${title}</h1><p style="color:#333;font-size:15px">${msg}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "sr";
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return html(400, lang, PAGE[lang].title, PAGE.error[lang]);
  await prisma.notificationPreference.upsert({
    where: { userId },
    update: { campaignsEnabled: false },
    create: { userId, campaignsEnabled: false },
  });
  const copy = PAGE[lang];
  return html(200, lang, copy.title, copy.msg);
}
