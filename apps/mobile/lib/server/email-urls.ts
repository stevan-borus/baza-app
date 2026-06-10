/**
 * Pure builders for the links embedded in transactional emails.
 *
 * These MUST match real Expo Router page routes — the activation page lives at
 * `/accept-invite` and the reset page at `/reset-password` (NOT under `/auth/*`,
 * which has no route and silently 404s). Keeping the path here, behind a tested
 * seam, is what stops that regression from coming back.
 */

export function buildInviteUrl(baseUrl: string, inviteToken: string): string {
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
}

export function buildResetUrl(baseUrl: string, resetToken: string): string {
  return `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
}
