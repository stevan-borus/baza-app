import { useRef, useState } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

/** How many rows to add each time the list is extended. */
export const REVEAL_PAGE_SIZE = 30;

/**
 * Reveal distance from the bottom, in px. Generous on purpose: the next page
 * is already in memory, so revealing early costs nothing and means the user
 * never watches the list end.
 */
const REVEAL_THRESHOLD = 600;

/**
 * Render-throttling for a list whose data is ALREADY fully loaded.
 *
 * A payroll month arrives in one response — a busy trainer's can run past a
 * thousand sessions — so the page size here is about how many cards are
 * mounted, not about fetching. That budget used to be spent through a
 * "Prikaži još" button, which asked the user to press for something they had
 * already downloaded. Scrolling to the bottom is the same intent without the
 * tap.
 *
 * Pass the FULL list length, spread `scrollProps` onto the ScrollView, and
 * slice your data to `visibleCount`. Call `reset()` whenever the underlying
 * list is replaced (a new month is a new list — keeping the old offset would
 * show a partial slice of unrelated rows).
 */
export function useRevealOnScroll(totalCount: number, pageSize = REVEAL_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  // The two measurements arrive on separate callbacks in either order, so
  // each one records its half and re-runs the check with whatever is known.
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);

  function revealMore() {
    setVisibleCount((n) => (n >= totalCount ? n : n + pageSize));
  }

  /**
   * Reveal the next page when the rows can't fill the viewport. Without this
   * a short first page — tall device, few rows — never produces a scroll
   * event, and the list is stuck at one page with no way forward.
   */
  function revealIfContentIsShort() {
    if (viewportHeight.current === 0 || contentHeight.current === 0) return;
    if (contentHeight.current <= viewportHeight.current + REVEAL_THRESHOLD) {
      revealMore();
    }
  }

  return {
    visibleCount,
    reset: () => setVisibleCount(pageSize),
    scrollProps: {
      scrollEventThrottle: 16,
      onLayout: (event: LayoutChangeEvent) => {
        viewportHeight.current = event.nativeEvent.layout.height;
        revealIfContentIsShort();
      },
      onContentSizeChange: (_width: number, height: number) => {
        contentHeight.current = height;
        revealIfContentIsShort();
      },
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, layoutMeasurement, contentSize } =
          event.nativeEvent;
        viewportHeight.current = layoutMeasurement.height;
        contentHeight.current = contentSize.height;
        if (
          contentOffset.y + layoutMeasurement.height >=
          contentSize.height - REVEAL_THRESHOLD
        ) {
          revealMore();
        }
      },
    },
  };
}
