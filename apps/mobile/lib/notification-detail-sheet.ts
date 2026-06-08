type DetailSheetDecision = {
  /** Did the tap handler push a route? (`useNotificationTapHandler` returns this.) */
  navigated: boolean;
  /** Did the body overflow the inbox's 2-line clamp? */
  bodyTruncated: boolean;
};

/**
 * Decide whether tapping a notification row should open the full-text detail
 * sheet. We only pop the sheet for messages that have nowhere to navigate AND
 * whose body is clamped — otherwise the row already shows everything, or the
 * tap is taking the user somewhere more useful.
 */
export function shouldOpenDetailSheet({ navigated, bodyTruncated }: DetailSheetDecision): boolean {
  return !navigated && bodyTruncated;
}
