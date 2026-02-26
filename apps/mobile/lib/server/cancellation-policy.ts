/** Late-cancel penalty logic for package session consumption. */

/**
 * Returns whether a cancellation should consume a package session.
 *
 * The penalty applies only when cancellation happens after the late-cancel
 * cutoff and before session start.
 */
export function shouldApplyLateCancelPenalty(
  sessionStartsAt: Date,
  canceledAt: Date,
  lateCancelHours: number,
) {
  const penaltyCutoff = new Date(
    sessionStartsAt.getTime() - lateCancelHours * 60 * 60 * 1000,
  );
  return canceledAt >= penaltyCutoff && canceledAt < sessionStartsAt;
}
