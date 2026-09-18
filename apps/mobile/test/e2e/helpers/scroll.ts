import type { Page } from "@playwright/test";

/**
 * Drive the inner ScrollView (not the window) to the bottom.
 *
 * RN-Web renders a ScrollView as a div with overflow:auto, so we walk up from
 * a row to find its scrollable ancestor and drive that. The scroll lands in
 * two steps — half, then bottom — because LegendList 3.3 marks the start edge
 * as reached on mount and only re-arms end-reached once the position has
 * passed through the middle; a single jump from top to bottom never does.
 * Each call re-steps from half, so it stays safe to call inside a poll.
 *
 * Returns false when no row matched or no scrollable ancestor exists.
 */
export async function scrollListToBottom(
  page: Page,
  rowSelector: string,
): Promise<boolean> {
  return page.evaluate((selector) => {
    const row = document.querySelector(selector);
    if (!row) return false;
    let node: HTMLElement | null = row as HTMLElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (
        /(auto|scroll)/.test(cs.overflowY) &&
        node.scrollHeight > node.clientHeight
      ) {
        for (const top of [node.scrollHeight / 2, node.scrollHeight]) {
          node.scrollTop = top;
          node.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }, rowSelector);
}
