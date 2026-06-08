import { verifyUnsubscribeToken } from "@/lib/server/campaign-unsubscribe-token";
import { prisma } from "@/lib/server/prisma";

/**
 * No-login marketing unsubscribe.
 *
 * GET renders a CONFIRMATION page — it must be a safe method, because email
 * link scanners, prefetchers (Apple/Gmail), and corporate AV proxies issue
 * automated GETs against any URL in the email body; if GET mutated, those
 * scanners would silently opt clients out. The actual opt-out happens on POST
 * (the confirm button, and the List-Unsubscribe-Post one-click target).
 */
const PAGE = {
  sr: {
    confirmTitle: "Odjava sa promotivnih poruka",
    confirmMsg: "Da li želiš da se odjaviš sa promotivnih poruka Baza Pilates studija?",
    confirmButton: "Odjavi me",
    doneTitle: "Odjava uspešna",
    doneMsg: "Više nećeš primati promotivne poruke od Baza Pilates studija. Možeš se ponovo prijaviti u podešavanjima obaveštenja u aplikaciji.",
    errorTitle: "Nevažeći link",
    errorMsg: "Link za odjavu je nevažeći.",
  },
  en: {
    confirmTitle: "Unsubscribe from promotions",
    confirmMsg: "Do you want to unsubscribe from Baza Pilates promotional messages?",
    confirmButton: "Unsubscribe me",
    doneTitle: "Unsubscribed",
    doneMsg: "You will no longer receive promotional messages from Baza Pilates. You can re-subscribe anytime in the app's notification settings.",
    errorTitle: "Invalid link",
    errorMsg: "This unsubscribe link is invalid.",
  },
} as const;

type Lang = "sr" | "en";

function shell(status: number, lang: Lang, title: string, inner: string) {
  return new Response(
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#fdf7f4;margin:0;padding:48px 16px;text-align:center"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><h1 style="color:#2e5b42;font-size:20px;margin:0 0 12px">${title}</h1>${inner}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function langOf(url: URL): Lang {
  return url.searchParams.get("lang") === "en" ? "en" : "sr";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = langOf(url);
  const token = url.searchParams.get("token") ?? "";
  const userId = verifyUnsubscribeToken(token);
  const copy = PAGE[lang];
  if (!userId) return shell(400, lang, copy.errorTitle, `<p style="color:#333;font-size:15px">${copy.errorMsg}</p>`);

  // Confirm page — the token is carried through the POST form, no mutation here.
  const action = `/api/unsubscribe?token=${encodeURIComponent(token)}&lang=${lang}`;
  const inner =
    `<p style="color:#333;font-size:15px;margin:0 0 20px">${copy.confirmMsg}</p>` +
    `<form method="post" action="${action}">` +
    `<button type="submit" style="background:#2e5b42;color:#fff;border:0;border-radius:8px;padding:12px 24px;font-size:15px;cursor:pointer">${copy.confirmButton}</button>` +
    `</form>`;
  return shell(200, lang, copy.confirmTitle, inner);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const lang = langOf(url);
  const token = url.searchParams.get("token") ?? "";
  const userId = verifyUnsubscribeToken(token);
  const copy = PAGE[lang];
  if (!userId) return shell(400, lang, copy.errorTitle, `<p style="color:#333;font-size:15px">${copy.errorMsg}</p>`);

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: { campaignsEnabled: false },
    create: { userId, campaignsEnabled: false },
  });
  return shell(200, lang, copy.doneTitle, `<p style="color:#333;font-size:15px">${copy.doneMsg}</p>`);
}
