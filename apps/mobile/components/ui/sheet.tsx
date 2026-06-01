import React, { createContext, useCallback, useEffect, useMemo, useRef } from "react";
import { Dimensions } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useThemeTokens } from "./tokens";

/**
 * Set to `true` for descendants of an `AppSheet`. Components like `<Input>`
 * read this to pick `BottomSheetTextInput` over the plain RN `TextInput`,
 * which is required for keyboard-aware behavior inside gorhom sheets and
 * crashes when used outside one.
 */
export const InsideBottomSheetContext = createContext<boolean>(false);

type AppSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /**
   * When `true`, AppSheet renders its children directly (no wrapping
   * BottomSheetScrollView). Use this when the caller wants to mount a
   * `BottomSheetFlatList` / `BottomSheetSectionList` / its own scroll
   * primitive — those must be direct children of `BottomSheetModal` for
   * gesture composition to work. Caller is responsible for handling the
   * sheet's padding (top/bottom/horizontal) and dynamic sizing.
   *
   * Default `false`: wraps in `BottomSheetScrollView` with the studio's
   * standard padding, which works for every "fits-or-grows" sheet form.
   */
  rawContent?: boolean;
  /**
   * Fixed snap points (e.g. `["90%"]`). When provided, dynamic sizing is
   * disabled and the sheet opens to the given height. Use for content with
   * unbounded length (legal docs, long lists) where peek-then-grow feels
   * broken. Default: dynamic sizing.
   */
  snapPoints?: readonly (string | number)[];
};

/**
 * Shared bottom-sheet wrapper.
 *
 * Built on `BottomSheetModal`. No FullWindowOverlay — its trade-offs (broken
 * keyboard toolbar position, gesture isolation, context isolation, native
 * date-picker conflicts) cost more than the bottom-bleed gap it solved.
 * The visible bottom area is now handled via the navigator's
 * `sceneContainerStyle` painting `bg-background` to the bottom edge.
 *
 * - Auto-sizes to its content (`enableDynamicSizing`).
 * - Caps at 90% of the window height; long content scrolls within an inner
 *   ScrollView the caller renders.
 *
 * Requires `<BottomSheetModalProvider>` mounted at the app root (see _layout).
 */
export function AppSheet({
  open,
  onOpenChange,
  children,
  rawContent = false,
  snapPoints,
}: AppSheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const tokens = useThemeTokens();

  const maxHeight = useMemo(
    () => Dimensions.get("window").height * 0.9,
    [],
  );

  // Track the modal's *actual* presented state and whether a desired open was
  // requested while a dismiss animation was still settling. Driving present()/
  // dismiss() purely off the `open` prop races with gorhom's animations: a
  // present() fired mid-dismiss is dropped, and after a couple of open/close
  // cycles the modal gets wedged and never reopens. We reconcile against the
  // real lifecycle (onDismiss) instead, retrying a deferred present once the
  // dismiss completes.
  const presentedRef = useRef(false);
  const pendingOpenRef = useRef(false);

  const reconcile = useCallback((shouldOpen: boolean) => {
    if (shouldOpen) {
      if (!presentedRef.current) {
        presentedRef.current = true;
        pendingOpenRef.current = false;
        ref.current?.present();
      }
    } else if (presentedRef.current) {
      // Mark dismiss in flight; onDismiss flips presentedRef back to false.
      ref.current?.dismiss();
    }
  }, []);

  useEffect(() => {
    if (open) {
      // If a dismiss is still animating (presentedRef true but parent just
      // toggled closed→open in one tick), defer; onDismiss will pick it up.
      pendingOpenRef.current = true;
      reconcile(true);
    } else {
      pendingOpenRef.current = false;
      reconcile(false);
    }
  }, [open, reconcile]);

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    onOpenChange(false);
    // If the parent re-requested open while we were dismissing, present now
    // that the modal is fully torn down.
    if (pendingOpenRef.current) {
      pendingOpenRef.current = false;
      requestAnimationFrame(() => {
        presentedRef.current = true;
        ref.current?.present();
      });
    }
  }, [onOpenChange]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing={!snapPoints}
      maxDynamicContentSize={maxHeight}
      snapPoints={snapPoints as (string | number)[] | undefined}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: tokens.surface }}
      handleIndicatorStyle={{ backgroundColor: tokens.muted }}
    >
      {rawContent ? (
        <InsideBottomSheetContext.Provider value={true}>
          {children}
        </InsideBottomSheetContext.Provider>
      ) : (
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <InsideBottomSheetContext.Provider value={true}>
            {children}
          </InsideBottomSheetContext.Provider>
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}
