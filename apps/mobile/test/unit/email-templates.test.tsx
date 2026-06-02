import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { formatFullName } from "@baza/types";
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
