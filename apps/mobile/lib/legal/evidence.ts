export type Evidence = {
  ipAddress: string | null;
  userAgent: string | null;
  appVersion: string | null;
};

/**
 * Server-side evidence bundle captured at the moment a consent is recorded.
 * Never trust client-supplied values for these fields — always read from
 * headers here. IP may be null in local dev. VPN-agnostic by design: this
 * is evidentiary metadata, not identity verification.
 */
export function extractEvidence(request: Request): Evidence {
  const headers = request.headers;
  const xff = headers.get("x-forwarded-for");
  const ipAddress = xff
    ? xff.split(",")[0]?.trim() ?? null
    : headers.get("x-real-ip");
  return {
    ipAddress: ipAddress ?? null,
    userAgent: headers.get("user-agent"),
    appVersion: headers.get("x-baza-app-version"),
  };
}
