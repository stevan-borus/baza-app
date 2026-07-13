/** Client-side mirror of the server late-cancel forfeit rule. */

/**
 * Returns whether canceling NOW would forfeit one package session.
 *
 * Mirrors BOTH halves of `shouldApplyLateCancelPenalty`
 * (lib/server/cancellation-policy.ts): the penalty applies only when
 * `now` is at/past the cutoff (`startsAt − lateCancelHours`, inclusive)
 * AND the session has not yet started. A post-start cancel never
 * forfeits on the server, so it must never show forfeit copy here.
 */
export function isInLateCancelWindow(
  sessionStartsAtMs: number,
  nowMs: number,
  lateCancelHours: number,
) {
  const cutoffMs = sessionStartsAtMs - lateCancelHours * 60 * 60 * 1000;
  return nowMs >= cutoffMs && nowMs < sessionStartsAtMs;
}
