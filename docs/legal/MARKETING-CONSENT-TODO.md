# Marketing-communications consent — status & remaining checks

> **Engineering flag, not a substitute for legal sign-off.** The marketing-consent clause has been **drafted into `privacy-v1.md`** (both `en/` and `sr/`) for the **Campaign** email feature. It still needs a lawyer's review before the studio goes live. We did **not** create a `privacy-v2` — the studio is not live, so v1 is edited in place.

## What was added to privacy-v1 (en + sr)

- New purpose bullet in **4.2** — "Direct marketing and promotional communications", legal basis = consent.
- New **Article 4A** — distinguishes service (transactional) vs. marketing communications; lists channels (in-app / push / email); describes giving + withdrawing consent (in-app "Promotions / new programmes" toggle + tokenized no-login email unsubscribe); no automated decision-making.
- New **5.2** bullet — e-mail delivery provider as a processor.
- New **section 8.1** retention row — marketing-consent + related contact data.
- **10.6 / 10.7** updated — marketing-consent withdrawal + right to object to direct marketing.

This maps 1:1 to the engineering model in `CONTEXT.md`: `campaignsEnabled` flag (opt-out), the tokenized unsubscribe endpoint, and the in-app "Promocije / novi programi" toggle.

## Remaining before launch (lawyer's call)

- [ ] Lawyer reviews the 4A / 4.2 / 5.2 / 8.1 / 10.6 / 10.7 wording in both languages.
- [ ] Confirm **opt-out** model (`campaignsEnabled` default `true`) is lawful for the jurisdiction (Serbia / GDPR-aligned), vs. requiring explicit **opt-in**. If opt-in is required, the default flips and the consent flow changes.
- [ ] Confirm the tokenized unsubscribe link + in-app toggle together satisfy "easy withdrawal".
- [ ] Decide whether the existing consent-tracking (consent metadata: date / version — see `privacy-v1.md` 8.1) must capture marketing consent separately at sign-up / first send.

Related ops gate: verified Resend sending domain + SPF/DKIM/DMARC — see `docs/deployment-runbook.md` → *Email deliverability*.
