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
}: AppSheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const tokens = useThemeTokens();

  const maxHeight = useMemo(
    () => Dimensions.get("window").height * 0.9,
    [],
  );

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  const handleDismiss = useCallback(() => onOpenChange(false), [onOpenChange]);

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
      enableDynamicSizing
      maxDynamicContentSize={maxHeight}
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
