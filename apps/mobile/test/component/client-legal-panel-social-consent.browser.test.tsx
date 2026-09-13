/**
 * Photo/video consent is mandatory at signup — `app/consent.tsx` puts
 * `socialAnswered` in `canSubmit`, so a client cannot pass the gate without
 * choosing yes or no. A missing record therefore never means "we're still
 * waiting on an answer"; it means the client predates the gate and we hold no
 * consent. The panel must say "Ne", because the studio may only publish a
 * client's photo on an affirmative yes.
 */
import { describe, expect, it } from "vitest";
import "@/lib/i18n";
import { ClientLegalPanel } from "@/components/admin/client-legal-panel";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { renderWithQueryClient } from "./helpers";

const CLIENT_ID = "client-1";

function seedConsent(socialMedia: { accepted: boolean; acceptedAt: string } | null) {
  return (client: Parameters<Parameters<typeof renderWithQueryClient>[1] & object>[0]) =>
    client.setQueryData(clientsQueries.consentRecords(CLIENT_ID).queryKey, {
      records: [],
      socialMedia,
    });
}

function renderPanel(socialMedia: { accepted: boolean; acceptedAt: string } | null) {
  return renderWithQueryClient(
    <ClientLegalPanel clientUserId={CLIENT_ID} clientFullName="Nada Zarić" lang="sr" />,
    seedConsent(socialMedia),
  );
}

describe("ClientLegalPanel — photo/video consent", () => {
  it("shows Ne when the client has no social-media record at all", () => {
    const { getByTestId } = renderPanel(null);
    expect(getByTestId(`social-media-status-${CLIENT_ID}`).textContent).toBe("Ne");
  });

  it("never shows the old 'Nije pitano' copy", () => {
    const { getByTestId } = renderPanel(null);
    expect(getByTestId(`social-media-status-${CLIENT_ID}`).textContent).not.toContain(
      "Nije pitano",
    );
  });

  it("still shows Da when the client accepted", () => {
    const { getByTestId } = renderPanel({
      accepted: true,
      acceptedAt: new Date("2026-06-27").toISOString(),
    });
    expect(getByTestId(`social-media-status-${CLIENT_ID}`).textContent).toBe("Da");
  });

  it("still shows Ne when the client explicitly refused", () => {
    const { getByTestId } = renderPanel({
      accepted: false,
      acceptedAt: new Date("2026-06-27").toISOString(),
    });
    expect(getByTestId(`social-media-status-${CLIENT_ID}`).textContent).toBe("Ne");
  });

  it("styles a missing record the same as an explicit refusal", () => {
    // Rendered in separate trees: mounting both into one DOM would make the
    // shared testID ambiguous and getByTestId would throw on the duplicate.
    const missing = renderPanel(null);
    const missingClass = missing.getByTestId(`social-media-status-${CLIENT_ID}`).className;
    missing.unmount();

    const refused = renderPanel({
      accepted: false,
      acceptedAt: new Date("2026-06-27").toISOString(),
    });
    const refusedClass = refused.getByTestId(`social-media-status-${CLIENT_ID}`).className;

    expect(missingClass).toBe(refusedClass);
  });
});
