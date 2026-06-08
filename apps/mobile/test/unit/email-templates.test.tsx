import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { formatFullName } from "@baza/types";
import { CampaignEmail } from "@/emails/campaign-email";
import { InviteEmail } from "@/emails/invite-email";
import { ResetEmail } from "@/emails/reset-email";

describe("formatFullName", () => {
  it("joins first and last with a single space", () => {
    expect(formatFullName("Ana", "Petrović")).toBe("Ana Petrović");
  });
  it("preserves multi-part first names", () => {
    expect(formatFullName("Ana Maria", "Petrović")).toBe("Ana Maria Petrović");
  });
});

describe("invite-email", () => {
  it("renders the activation CTA with the user's name and the invite URL", async () => {
    const html = await render(
      <InviteEmail
        fullName="Marija Petrović"
        inviteUrl="https://baza.test/invite?token=abc"
      />,
    );
    expect(html).toMatchSnapshot();
  });

  it("falls back gracefully when the user's name contains HTML-unsafe characters", async () => {
    const html = await render(
      <InviteEmail
        fullName="<script>alert(1)</script>"
        inviteUrl="https://baza.test/invite?token=safe"
      />,
    );
    // Raw <script> must NOT appear in the output — React's JSX rendering
    // escapes string children, so the rendered HTML should escape the angle
    // brackets to entities.
    expect(html).not.toMatch(/<script>/i);
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("campaign-email", () => {
  const baseProps = {
    title: "Letnji reformer program",
    body: "Zdravo,\n\nUpis je otvoren.",
    unsubscribeUrl: "https://baza.test/api/unsubscribe?token=abc",
    logoUrl: "https://baza.test/email-logo.png",
    logoDarkUrl: "https://baza.test/email-logo-dark.png",
    chrome: {
      unsubscribeText: "Odjavite se",
      footerNote: "Novosti i ponude studija Baza Pilates. Ne želite ovo?",
    },
  };

  const imgFor = (html: string, cls: string) =>
    html.split(/<img\b/i).find((chunk) => chunk.includes(`class="${cls}"`));

  it("centers the light logo as a block image with auto side margins", async () => {
    const html = await render(<CampaignEmail {...baseProps} />);
    // The light logo shows by default; for it to sit centered (not left-
    // shifted) it must be a *block* image with auto horizontal margins —
    // `margin:auto` can't center an inline-block.
    const lightImg = imgFor(html, "logo-light");
    expect(lightImg).toBeDefined();
    expect(lightImg).toMatch(/display:\s*block/);
    expect(lightImg).toMatch(/margin(-left)?:\s*(0 auto|auto)/);
    expect(lightImg).not.toMatch(/display:\s*inline-block/);
  });

  it("hides the dark logo by default so it adds no dead space in a light inbox", async () => {
    const html = await render(<CampaignEmail {...baseProps} />);
    // react-email's <Img> injects an inline `display:block`, which BEATS a
    // stylesheet `.logo-dark{display:none}`. So the off-mode (dark) logo must
    // carry inline `display:none` itself — otherwise it stacks invisibly under
    // the light logo and leaves a gap. The dark-mode @media flips it back on
    // with !important (which overrides inline).
    const darkImg = imgFor(html, "logo-dark");
    expect(darkImg).toBeDefined();
    expect(darkImg).toMatch(/display:\s*none/);
    expect(html).toMatch(/@media[^}]*prefers-color-scheme:\s*dark[\s\S]*\.logo-dark\s*\{[^}]*display:\s*block\s*!important/);
  });

  it("does not render a promo overline above the heading", async () => {
    // Even if a caller still threads a headerLabel through, the template must
    // not surface it — the overline element is gone entirely.
    const html = await render(
      <CampaignEmail
        {...baseProps}
        chrome={{ ...baseProps.chrome, headerLabel: "Promocije / novi programi" } as never}
      />,
    );
    expect(html).not.toContain("email-overline");
    expect(html).not.toMatch(/Promotions|Promocije/i);
  });

  it("renders the unsubscribe link inline within the footer sentence", async () => {
    const html = await render(<CampaignEmail {...baseProps} />);
    // The lead-in sentence and the linked unsubscribe word live in ONE
    // paragraph — the link is part of the sentence, not a separate line.
    expect(html).toContain("Novosti i ponude studija Baza Pilates. Ne želite ovo?");
    expect(html).toContain("Odjavite se");
    expect(html).toContain(baseProps.unsubscribeUrl);
    // The anchor must sit INSIDE the footer paragraph — i.e. between the
    // lead-in text and the </p> that closes it — not as a sibling on its own
    // line. Slice from the lead-in to the next </p> and assert the link is
    // within that span.
    const start = html.indexOf("Ne želite ovo?");
    const paragraphEnd = html.indexOf("</p>", start);
    const linkPos = html.indexOf(baseProps.unsubscribeUrl);
    expect(start).toBeGreaterThan(-1);
    expect(linkPos).toBeGreaterThan(start);
    expect(linkPos).toBeLessThan(paragraphEnd);
  });
});

describe("reset-email", () => {
  it("renders the reset CTA pointing at the supplied reset URL", async () => {
    const html = await render(
      <ResetEmail resetUrl="https://baza.test/reset?token=xyz" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("does not render the user's email or any token value other than the URL itself", async () => {
    const url = "https://baza.test/reset?token=opaque-secret";
    const html = await render(<ResetEmail resetUrl={url} />);
    expect(html).toContain(url);
    // Sanity: no leakage of fields not passed in (the component only takes
    // resetUrl, so any reference to other PII would be a bug).
    expect(html).not.toMatch(/userId|email=/i);
  });
});
