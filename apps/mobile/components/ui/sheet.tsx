import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { BottomSheetView } from "./styled";

type AppSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  snapPoints?: (string | number)[];
};

export function AppSheet({
  open,
  onOpenChange,
  children,
  snapPoints = ["60%", "90%"],
}: AppSheetProps) {
  const ref = useRef<BottomSheet>(null);
  const points = useMemo(() => snapPoints, [snapPoints]);

  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) onOpenChange(false);
    },
    [onOpenChange],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={points}
      enablePanDownToClose
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: Platform.OS === "ios" ? "transparent" : "#0A0F14",
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.35)" }}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={60}
          tint="dark"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <BottomSheetView className="px-6 pt-2 pb-10">
        <View>{children}</View>
      </BottomSheetView>
    </BottomSheet>
  );
}
