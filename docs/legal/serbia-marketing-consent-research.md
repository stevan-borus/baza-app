# Marketing-consent research — Serbia (direct marketing email)

> **⚠️ THIS IS NOT LEGAL ADVICE.**
>
> This is **engineering desk research**, written by a developer reading statutes, to
> inform and shorten a qualified Serbian lawyer's review. It is not a legal opinion,
> it does not create a lawyer–client relationship, and it **does not satisfy the
> legal sign-off that `MARKETING-CONSENT-TODO.md` requires before launch.** Every
> conclusion below must be confirmed by a Serbian lawyer before the studio sends a
> single marketing email.
>
> Researched 2026-09-12. Laws change; re-verify before relying on this.

---

## Bottom line

**An opt-out model for marketing email is not lawful in Serbia.** Serbian law
requires **prior opt-in consent** (`prethodni pristanak`) before any commercial
message is sent electronically — Article 8 of the Law on Electronic Commerce states
it plainly, and Article 63 of the Law on Advertising says the same thing
independently. **No soft opt-in / existing-customer exemption exists in Serbian law**
(see Q2 — this is the pivotal finding, and it is a negative one). The current
`campaignsEnabled` default of `true` therefore has to flip to `false`, and an
affirmative opt-in has to be captured before the first campaign send.

My confidence in "opt-out is unlawful" is **high**. My confidence in "no soft opt-in
exists" is **moderate-to-high** — it rests on the absence of a carve-out in the
statutory text plus four independent sources that describe the rule as unqualified,
which is strong but is still partly an argument from silence. See
[Open questions](#open-questions-for-the-lawyer).

---

## Q1 — Which statute governs, and is opt-out lawful?

**Governing statute: the Law on Electronic Commerce (Zakon o elektronskoj trgovini),
Articles 7 and 8.** This — not the ZZPL — is the *lex specialis* for unsolicited
commercial electronic messages. It functions as Serbia's ePrivacy analogue. The Law
on Advertising (Art. 62–63) imposes a parallel consent requirement, and the ZZPL sits
underneath both as the general data-protection layer.

### Law on Electronic Commerce — Art. 8 (PRIMARY)

"Sl. glasnik RS", br. **41/2009, 95/2013 i 52/2019** (latest amendment July 2019).
Source: [paragraf.rs — Zakon o elektronskoj trgovini](https://www.paragraf.rs/propisi/zakon_o_elektronskoj_trgovini.html)

> **Član 8 — Slanje komercijalne poruke**
>
> „Slanje komercijalne poruke elektronskim putem, dozvoljeno je samo uz **prethodni
> pristanak** lica kome je takva vrsta poruke namenjena.
>
> Pružalac usluge dužan je da redovno proverava i prihvata **opoziv pristanka** koji
> upućuje lice koje ne želi da prima takve komercijalne poruke.”

**Translation:** "Sending a commercial message by electronic means is permitted only
with the **prior consent** of the person for whom such a message is intended. The
service provider is obliged to regularly check and accept the **withdrawal of
consent** issued by a person who does not wish to receive such commercial messages."

Two things to note in the structure. First, "prior consent" is the gate — consent
must exist *before* the send, which is definitionally incompatible with a default-on
flag. Second, the withdrawal duty in paragraph 2 is an *additional* obligation layered
on top of consent, not an alternative to it. A system offering only withdrawal
satisfies paragraph 2 and fails paragraph 1.

**Definition of the regulated object — Art. 3(6):**

> „**komercijalna poruka** je svaki oblik komunikacije u cilju promovisanja robe,
> usluga ili poslovnog ugleda pravnog ili fizičkog lica koje obavlja registrovanu
> delatnost...”

**Translation:** "a **commercial message** is any form of communication intended to
promote the goods, services or business reputation of a legal or natural person
performing a registered activity."

A "Promocije / novi programi" campaign promoting studio classes falls squarely inside
this. Note what does *not*: genuinely transactional mail (booking confirmations,
package expiry, payment receipts) is not promoting goods or services and is outside
Art. 8. The service/marketing split already drawn in `privacy-v1.md` Art. 4A is the
right line and it matters legally, not just editorially.

**Penalty — Art. 22:**

> „Novčanom kaznom od **100.000 dinara** kazniće se za prekršaj pružalac usluga –
> pravno lice ako... postupi suprotno članu 8. ovog zakona.”

100,000 RSD for a legal entity, 20,000 RSD for an entrepreneur, 10,000 RSD for the
responsible person. Source: [paragraf.rs — 2019 amendments](https://www.paragraf.rs/izmene_i_dopune/260719-zakon-o-izmenama-i-dopunama-zakona-o-elektronskoj-trgovini.html).
Some secondary reporting states a range of 100,000–1,000,000 RSD; I could not
reconcile the discrepancy from primary text and did not resolve it. The amount is not
decision-relevant here — the prohibition is.

The 2019 amendment package added the misdemeanour sanction for Art. 8, which is why
contemporary Serbian commentary frames this as a *new* enforcement risk rather than a
new rule. Source (secondary, dated 2019-07-26):
[propisi.net](https://propisi.net/novine-u-zakonu-u-elektronskoj-trgovini-slanje-komercijalnih-poruka-putem-mejla-i-sms-a-moguce-samo-uz-prethodni-pristanak-potrosaca/).

### Law on Advertising — Art. 62–63 (PRIMARY, parallel requirement)

"Sl. glasnik RS", br. **6/2016 i 52/2019 – dr. zakon**.
Source: [paragraf.rs — Zakon o oglašavanju](https://www.paragraf.rs/propisi/zakon_o_oglasavanju.html)

> **Član 62:** „Direktno oglašavanje je upućivanje oglasne poruke imenovanom ili na
> drugi način pojedinačno određenom licu.”
>
> **Član 63:** „Za direktno oglašavanje prema fizičkim licima potrebna je njihova
> **prethodna saglasnost**. Saglasnost koja je data... može se **opozvati u svakom
> momentu**, a oglašivač... mora to da omogući.”

**Translation:** Art. 62 — "Direct advertising is the addressing of an advertising
message to a named or otherwise individually determined person." Art. 63 — "Direct
advertising towards natural persons requires their **prior consent**. Consent given...
may be **withdrawn at any moment**, and the advertiser... must make that possible."

A campaign email to a named client is direct advertising to a natural person. So the
opt-in requirement holds under two statutes independently. Even if a lawyer found some
reading of Art. 8, Art. 63 would still bite.

Art. 63 also carves out B2B: consent is not required for advertising to persons
performing a business activity, in connection with that activity. Studio clients are
consumers, so this does not help here.

### Secondary confirmation

- [DLA Piper, Data Protection Laws of the World — Serbia, electronic marketing](https://www.dlapiperdataprotection.com/index.html?t=electronic-marketing&c=RS)
  (last modified **13 February 2026**): electronic marketing in Serbia requires
  "explicit, prior consent". *Secondary commentary.*
- [RNIDS / domen.rs, "Spam ili dozvoljeni marketing", Nevena Ružić, 2023-09-18](https://www.domen.rs/sr-latn/spam-ili-dozvoljeni-marketing):
  „Prema propisima Republike Srbije, svako slanje komercijalne poruke... zabranjeno je
  bez prethodnog pristanka lica.” ("Under the regulations of the Republic of Serbia,
  any sending of a commercial message... is prohibited without the prior consent of
  the person.") *Secondary commentary, though RNIDS is the national domain registry
  and the author is a former Poverenik official.*

**Answer to Q1: opt-out is not lawful. Opt-in is required.** Confidence: high. Two
statutes, congruent text, congruent secondary sources, no contrary source found.

---

## Q2 — Is there a soft opt-in / existing-customer exemption?

**No such exemption appears in Serbian law.** This is the pivotal question and the
answer is negative.

The ePrivacy Directive Art. 13(2) soft opt-in is an **EU instrument**. Serbia is not
an EU member, the Directive has no direct effect there, and **Serbia has not
transposed an Art. 13(2) analogue into the Law on Electronic Commerce.** Art. 8 as
quoted above is two sentences long and contains no conditional clause — no "unless the
contact details were obtained in the course of a sale", no "similar products or
services", none of the Art. 13(2) machinery. The exemption simply is not in the text.

What I checked and what I found:

1. **The statutory text itself.** Art. 8 has no carve-out.
   [paragraf.rs](https://www.paragraf.rs/propisi/zakon_o_elektronskoj_trgovini.html)
2. **The 2019 amendment text**, in case a carve-out was added later. It was not; the
   amendment strengthened the rule and added penalties.
   [paragraf.rs 2019 amendments](https://www.paragraf.rs/izmene_i_dopune/260719-zakon-o-izmenama-i-dopunama-zakona-o-elektronskoj-trgovini.html)
3. **DLA Piper's Serbia chapter** (Feb 2026). It lists the exemptions that *do* exist
   post-2019 and a customer relationship is not among them.
   [DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=electronic-marketing&c=RS)
4. **Serbian-language commentary.** The RNIDS piece states the prohibition without
   qualification and mentions no customer exemption.
   [domen.rs](https://www.domen.rs/sr-latn/spam-ili-dozvoljeni-marketing)
5. **Targeted searches in Serbian** for a legitimate-interest or existing-customer
   route to newsletters. No Serbian source asserting such an exemption surfaced. The
   only soft opt-in material returned was EU/Croatian, discussing the Directive as EU
   law. Example: [biconsult.hr on ePrivacy as lex specialis (Croatian)](https://www.biconsult.hr/gdprcroatia/2524-eprivacy-direktiva-je-lex-specialis-u-odnosu-na-gdpr-za-izravni-marketing).
   **Croatian law is not Serbian law** and must not be relied on here; it is cited
   only to show where the soft opt-in concept actually lives.

**The exemptions that do exist** (post-2019, communications that are *not* commercial
messages and so fall outside Art. 8 entirely), per DLA Piper:

1. information enabling direct access to a business's activity (e.g. an e-address or
   email address);
2. information about goods, services or business reputation obtained through research
   or similar means, provided free of charge.

Neither describes a promotional campaign about new studio programmes.

**A tempting-but-wrong workaround, flagged deliberately.** Under the ZZPL it is
arguable that direct marketing to existing customers could rest on *legitimate
interest* (`legitimni interes`, ZZPL Art. 12(1)(6)) rather than consent — the Serbian
DPA does publish general guidance on legitimate interest as a basis. That argument
does not rescue the opt-out model, because **the Law on Electronic Commerce and the
Law on Advertising impose a consent requirement that is independent of the ZZPL's
legal basis.** Satisfying the ZZPL does not satisfy Art. 8. A lawyer may wish to
confirm this lex specialis relationship explicitly (see Open questions), but an
engineering plan should not be built on the legitimate-interest theory.

**Answer to Q2: no soft opt-in exemption found.** Confidence: moderate-to-high. The
statutory text is clear and four sources are congruent, but I am partly reasoning from
absence — I cannot prove a negative across all Serbian law, sublegal acts and
Poverenik opinions from desk research. **This is the single highest-value item to put
in front of the lawyer**, because it is the only finding that, if wrong, would make
the current implementation lawful as-is.

---

## Q3 — Do the tokenized unsubscribe link + in-app toggle satisfy "easy withdrawal"?

**Probably yes for the withdrawal mechanism, on the assumption that valid consent was
obtained in the first place.** The mechanism is not the problem; the missing consent
is. Withdrawal machinery cannot substitute for the Art. 8 gate.

**ZZPL Art. 15 (Uslovi za davanje pristanka)** — "Sl. glasnik RS", br. **87/2018**,
in force since **21 August 2019**.
Source: [paragraf.rs — ZZPL](https://www.paragraf.rs/propisi/zakon_o_zastiti_podataka_o_licnosti.html)

Art. 15 requires that withdrawal of consent be **„jednostavno, kao i davanje
pristanka”** — "as simple as the giving of consent". The controller must also be able
to demonstrate that consent was given, and withdrawal does not retroactively affect
processing already lawfully carried out.

**Law on Electronic Commerce Art. 8(2)** separately obliges the provider to "regularly
check and accept" withdrawals — an operational duty, i.e. unsubscribes must actually
take effect promptly, not merely be technically offered.

**Law on Advertising Art. 63** requires that withdrawal be possible "at any moment"
and that the advertiser enable it.

Against that standard:

- A **tokenized no-login unsubscribe link** is strong. It requires no authentication,
  no account recovery, and no friction — this is the gold standard under GDPR-style
  analysis and there is no reason to think Serbian regulators would read it
  differently.
- The **in-app toggle** is a good second channel and maps onto the "at any moment"
  requirement.
- The **`List-Unsubscribe` header** is not legally required anywhere I found, but it
  helps deliverability and demonstrates good faith.

The symmetry test in Art. 15 cuts the other way against the *current* design, though,
and this is worth stating plainly: if consent is "given" by doing nothing at sign-up,
then withdrawal being one click is not symmetric — it is *harder* than the (non-)act
of giving. Once consent becomes a deliberate checkbox, a one-click unsubscribe is
comfortably symmetric. Fixing Q1/Q4 also fixes the theoretical Art. 15 asymmetry.

One operational requirement worth building for: **honour unsubscribes promptly and
keep a suppression record.** Art. 8(2)'s "regularly check and accept" implies the
unsubscribe cannot sit in a queue for a week.

**Answer to Q3: the withdrawal mechanism looks adequate.** Confidence: moderate. I
found no Serbian source specifying a maximum time to honour a withdrawal or mandating
a particular mechanism, so this is an application of the general standard rather than
a quotation of a specific rule.

---

## Q4 — Must marketing consent be captured separately and explicitly at sign-up?

**Yes — separately, explicitly, and by an affirmative act. A default-true flag does
not qualify as consent under the ZZPL.**

**ZZPL Art. 4(1)(12) — definition of consent:**

> „**pristanak** lica na koje se podaci odnose je svako **dobrovoljno, određeno,
> informisano i nedvosmisleno** izražavanje volje tog lica, kojim to lice, **izjavom
> ili jasnom potvrdnom radnjom**, daje pristanak za obradu podataka o ličnosti koji se
> na njega odnose”

**Translation:** "**consent** of the data subject is any **freely given, specific,
informed and unambiguous** expression of that person's will, by which that person, by
a **statement or by a clear affirmative action**, gives consent to the processing of
personal data relating to them."

This is verbatim the GDPR Art. 4(11) standard. The operative phrase is **„jasnom
potvrdnom radnjom”** — *a clear affirmative action*. A flag that is `true` because
nobody touched it is the definitional opposite: it is silence. There is no statement
and no affirmative action. Under the GDPR this is settled (Recital 32 and *Planet49*,
C-673/17, both reject pre-ticked boxes and inaction), and since the ZZPL copies the
definition word-for-word, the same reading is all but certain in Serbia. I did not
locate a Serbian court or Poverenik decision squarely on pre-ticked boxes — that is a
gap, not a contradiction.

**ZZPL Art. 15 — separation requirement:**

Where a consent request is bundled with other matters (e.g. terms of service), Art. 15
requires that **„zahtev za davanje pristanka mora biti predstavljen na način kojim se
izdvaja od tih drugih pitanja”** — "the request for consent must be presented in a
manner which distinguishes it from those other matters". Art. 15 further prohibits
conditioning the performance of a contract on consent that is not necessary for that
contract.

So: marketing consent **cannot** be folded into acceptance of the general terms or
privacy policy. Accepting the ToS is not consenting to marketing, and the studio
cannot make booking classes contingent on accepting marketing.

**Demonstrability.** Art. 15 requires the controller to be able to **demonstrate** that
consent was given. This means the system needs a consent *record*, not just a boolean:
who consented, when, to what text/version. `privacy-v1.md` §8.1 already contemplates
consent metadata (date / version) — that structure needs to cover marketing consent
specifically, which is exactly the open item in `MARKETING-CONSENT-TODO.md`.

**Answer to Q4: yes — separate, explicit, affirmative, recorded, and unbundled from
the ToS.** Confidence: high.

---

## Q5 — Requirements on the CONTENT of marketing email

**Law on Electronic Commerce Art. 7 (PRIMARY):**

> **Član 7 — Uslovi za komercijalnu poruku**
>
> „Komercijalna poruka koja je delimično ili u celini usluga informacionog društva
> mora da zadovolji sledeće uslove:
>
> 1) da je komercijalnu poruku moguće **kao takvu jasno identifikovati** u trenutku
> kada je korisnik usluga primi;
>
> 2) da je **lice u čije ime je komercijalna poruka sačinjena moguće jasno
> identifikovati**...”

**Translation:** "A commercial message which is wholly or partly an information
society service must satisfy the following conditions: 1) that the commercial message
can be **clearly identified as such** at the moment the service user receives it;
2) that the **person on whose behalf the commercial message was created can be clearly
identified**..."

Practical consequences for the campaign template:

1. **Recognisable as advertising on receipt.** The subject line and the top of the
   body must not disguise a promotion as a transactional notice. "Novi programi u
   studiju" is fine; dressing a promo up as a booking confirmation is not.
2. **Sender clearly identifiable.** Studio's legal name, and realistically its address
   and contact details, visible in the message. A bare display name on a generic
   sending domain is thin.
3. **Unsubscribe route stated in the message.** Art. 8(2) plus Art. 63 of the
   Advertising Law require withdrawal to be available at any moment; in practice this
   means visible unsubscribe copy in every campaign, not only the `List-Unsubscribe`
   header (headers are invisible to the recipient, so a header alone does not make
   withdrawal available to a human).

**Law on Advertising Art. 13** adds a general recognisability rule: where an
advertising message appears alongside other information, it must be clearly marked
with an identifiability mark („**oznaka prepoznatljivosti**”). Relevant if promotional
content ever gets mixed into an otherwise transactional email — cleanest to keep
campaigns and transactional mail strictly separate, which the current architecture
already does.

**DLA Piper** (secondary) additionally notes the identification should be **in the
Serbian language** before marketing begins, and that an opt-out option must be offered
**free of charge**. Serbian being the default locale in this app, that is already the
case.

**Consumer Protection Law** (Zakon o zaštiti potrošača, "Sl. glasnik RS" br. 88/2021,
in force 20 December 2021) maintains an opt-out registry restricting **phone calls and
SMS** to registered consumers. Per DLA Piper this targets telephone/SMS channels, not
email. **If the app ever adds SMS marketing, this becomes a separate compliance
workstream** — the registry has to be checked before sending. I did not research the
SMS rules in depth since the current feature is email-only.

**Answer to Q5:** identifiable as advertising, identify the sender, provide a visible
unsubscribe, keep promo separate from transactional. Confidence: high on Art. 7 (quoted
primary text), moderate on the operational details drawn from DLA Piper.

---

## What this means for the current implementation

Mapping onto the engineering model in `CONTEXT.md` and `privacy-v1.md` Art. 4A:

### Must change

**1. `campaignsEnabled` must default to `false`.**
This is the core finding. A default of `true` means the system treats silence as
consent, which fails ZZPL Art. 4(1)(12) („jasnom potvrdnom radnjom”) and means sends
occur without the „prethodni pristanak” that Art. 8 of the Law on Electronic Commerce
requires. Both the Prisma schema default and any application-layer fallback need to
flip. Check for code that reads the preference as "enabled unless explicitly
disabled" — the absence of a preference row must mean *not consented*, never
*consented*.

**2. Existing clients cannot be grandfathered in.**
There is no soft opt-in, so clients already in the database were never lawfully
enrolled and flipping the default does not retroactively fix them. Any client whose
`campaignsEnabled` is `true` purely by default has not consented. Practically: treat
the existing population as un-consented and run a **re-permission flow** — but note
that a re-permission email is itself a commercial message if it markets anything, so
it must be strictly a service/administrative message ("update your notification
preferences") with no promotional content. *Flag this specific point to the lawyer;
re-permission campaigns are a classic trap and the safe framing is narrow.*

**3. A separate, unbundled marketing-consent step is needed at sign-up.**
Per ZZPL Art. 15, it cannot be folded into ToS/privacy acceptance. Requirements:
unticked by default, distinct from the terms checkbox, its own plain-language label
describing marketing email specifically, and not a condition of registering or
booking. The existing "Promocije / novi programi" label is a reasonable starting
string but needs copy making clear it covers **email** marketing, in both `sr.json`
and `en.json`.

**4. Consent must be recorded, not just flagged.**
Art. 15 demands demonstrability. A boolean cannot prove when consent was given or to
what wording. Needed: timestamp, the policy/consent-text version, and ideally the
channel/UI where it was captured. `privacy-v1.md` §8.1 already anticipates consent
metadata; marketing consent needs its own row rather than riding on the general
privacy-policy acceptance. This closes the last unchecked box in
`MARKETING-CONSENT-TODO.md`.

**5. Campaign email content needs an Art. 7 audit.**
Verify every campaign template: recognisable as promotional from the subject line,
studio's legal identity present, visible unsubscribe copy in the body (not only the
`List-Unsubscribe` header).

### Can stay as-is

- **The tokenized no-login unsubscribe link.** Meets the "as simple as giving"
  standard well. Keep it.
- **The in-app "Promocije / novi programi" toggle.** Good second withdrawal channel.
  After the change it doubles as the *consent* control, so its default state is the
  thing that matters.
- **The `List-Unsubscribe` header.** Not legally required as far as I found, but
  keep it — deliverability plus good faith.
- **The transactional/marketing split** in `privacy-v1.md` Art. 4A. This is not just
  good documentation, it is load-bearing: transactional mail is outside Art. 8's
  definition of a commercial message, so the split is what keeps booking
  confirmations lawful without marketing consent. Guard it — do not let promotional
  content leak into transactional templates, or those templates become commercial
  messages requiring consent.

### Documentation follow-on

`privacy-v1.md` §4.2 records the legal basis for marketing as **consent**, which is
correct and consistent with these findings. But the document currently describes an
opt-out reality. Once the code flips to opt-in, the Art. 4A description of "giving +
withdrawing consent" should describe an affirmative opt-in, and the lawyer should
review that revised wording rather than the current text.

### Risk if shipped unchanged

Misdemeanour liability under Art. 22 of the Law on Electronic Commerce (100,000 RSD
for a legal entity), plus exposure under the Law on Advertising and a possible ZZPL
complaint to the Poverenik for processing without a valid legal basis. The sums are
small; the reputational and regulatory-attention risk for a small studio is the larger
concern. **This is not a "ship it and fix it later" item** — every send made under the
opt-out model is a separate potential violation against a defined client list.

---

## Open questions for the lawyer

Ordered by how much the answer changes the engineering plan.

1. **Is the Q2 conclusion right — is there genuinely no soft opt-in / existing-customer
   exemption anywhere in Serbian law?** *(Highest value.)* I reasoned from the absence
   of a carve-out in Art. 8 plus congruent secondary sources. I cannot rule out a
   sublegal act, a Poverenik opinion, or judicial practice that reads one in. **If an
   exemption exists, the current implementation may be lawful as-is and items 1–3
   above evaporate.** If it does not, the work is as scoped. Nothing else in this
   document is worth as much as a definitive answer here.

2. **How should existing clients already flagged `campaignsEnabled = true` be
   handled?** Specifically: is a purely administrative re-permission email lawful, and
   what exact framing keeps it from being a commercial message under Art. 3(6)? This
   determines whether the studio can retain its list or must rebuild it from the
   app UI alone.

3. **Does the Law on Electronic Commerce Art. 8 consent requirement operate
   independently of the ZZPL legal basis?** I have assumed yes (lex specialis), which
   is why the legitimate-interest route is a dead end. Confirmation would close off a
   line of argument that is otherwise tempting and, I believe, wrong.

4. **What exactly must the consent record capture to satisfy the Art. 15
   demonstrability burden in Serbia?** Timestamp + text version + channel is my
   assumption from GDPR practice; I found no Serbian rule specifying the contents. This
   is a concrete schema decision.

5. **Is a single combined consent for "email + push + in-app" marketing specific
   enough**, or does „određeno” (specific) require per-channel consent? Affects whether
   the preference model is one flag or several.

6. **How quickly must a withdrawal be honoured** under Art. 8(2)'s "regularly check and
   accept"? No source specified a deadline. Determines whether unsubscribe processing
   must be synchronous or can be batched.

7. **Does the Consumer Protection Law opt-out registry touch email at all**, or is it
   telephone/SMS only? I relied on DLA Piper (secondary) for "SMS and calls" and did
   not read the primary text of the 88/2021 law. Becomes urgent if SMS marketing is
   ever added.

8. **Review the Art. 7 identification requirements against the actual campaign
   templates.** A lawyer eyeballing the rendered email is worth more than my reading of
   the statute.

9. **Is the discrepancy in the Art. 22 fine range material?** Primary text I retrieved
   shows 100,000 RSD; some secondary reporting says 100,000–1,000,000 RSD. Does not
   change the plan, but the lawyer may want the accurate figure for the risk register.

---

## Sources

**Primary (statutory text):**

- [Zakon o elektronskoj trgovini](https://www.paragraf.rs/propisi/zakon_o_elektronskoj_trgovini.html) — "Sl. glasnik RS", br. 41/2009, 95/2013, 52/2019. Art. 3(6), 7, 8, 22. Accessed 2026-09-12.
- [Zakon o izmenama i dopunama Zakona o elektronskoj trgovini (2019)](https://www.paragraf.rs/izmene_i_dopune/260719-zakon-o-izmenama-i-dopunama-zakona-o-elektronskoj-trgovini.html) — July 2019 amendments. Accessed 2026-09-12.
- [Zakon o oglašavanju](https://www.paragraf.rs/propisi/zakon_o_oglasavanju.html) — "Sl. glasnik RS", br. 6/2016, 52/2019 – dr. zakon. Art. 13, 62, 63. Accessed 2026-09-12.
- [Zakon o zaštiti podataka o ličnosti (ZZPL)](https://www.paragraf.rs/propisi/zakon_o_zastiti_podataka_o_licnosti.html) — "Sl. glasnik RS", br. 87/2018, in force 21 Aug 2019. Art. 4(1)(12), 12, 15, 37. Accessed 2026-09-12.

*Note on sourcing: paragraf.rs (Paragraf Lex) is a commercial Serbian legal database
that republishes consolidated statutory text. It is the most accessible route to
Serbian statutes but is a republisher — for a formal opinion, the lawyer should verify
against Službeni glasnik RS / pravno-informacioni-sistem.rs. I did not independently
verify the consolidated text against the Official Gazette.*

**Secondary (commentary — not law):**

- [DLA Piper, Data Protection Laws of the World — Serbia, "Electronic marketing"](https://www.dlapiperdataprotection.com/index.html?t=electronic-marketing&c=RS) — last modified 13 February 2026.
- [RNIDS / domen.rs, "Spam ili dozvoljeni marketing", Nevena Ružić](https://www.domen.rs/sr-latn/spam-ili-dozvoljeni-marketing) — 18 September 2023.
- [propisi.net, "Novine u Zakonu o elektronskoj trgovini"](https://propisi.net/novine-u-zakonu-u-elektronskoj-trgovini-slanje-komercijalnih-poruka-putem-mejla-i-sms-a-moguce-samo-uz-prethodni-pristanak-potrosaca/) — 26 July 2019.
- [BI Consult (Croatia), ePrivacy as lex specialis for direct marketing](https://www.biconsult.hr/gdprcroatia/2524-eprivacy-direktiva-je-lex-specialis-u-odnosu-na-gdpr-za-izravni-marketing) — **Croatian law, cited only to locate the soft opt-in concept in EU law. Not applicable to Serbia.**

**Could not obtain:** the Poverenik's own guidance page on legitimate interest
(poverenik.rs) returned HTTP 404 at the URL surfaced by search. I found no Poverenik
opinion or decision directly addressing direct marketing to existing customers, and I
would not expect desk research to surface one reliably — this is question 1 for the
lawyer.
