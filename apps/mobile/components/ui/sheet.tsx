import React, { createContext, useCallback, useEffect, useMemo, useRef } from "react";
import { Dimensions } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { BottomSheetView } from "./styled";
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
export function AppSheet({ open, onOpenChange, children }: AppSheetProps) {
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
      <BottomSheetView className="px-6 pt-2 pb-10">
        <InsideBottomSheetContext.Provider value={true}>
          {children}
        </InsideBottomSheetContext.Provider>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
