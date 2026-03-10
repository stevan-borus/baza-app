import React, { PropsWithChildren, useEffect, useState } from "react";
import { Sheet, Theme } from "tamagui";
import { useColorScheme } from "@/components/useColorScheme";
import { GLASS_BORDER } from "./tokens";

export function AppSheet({
  open,
  onOpenChange,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const isDark = useColorScheme() === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
    setMounted(false);
  }, [open]);

  if (!open || !mounted) return null;

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      moveOnKeyboardChange
    >
      <Theme name={isDark ? "dark" : "light"}>
        <Sheet.Overlay opacity={0.55} bg="rgba(0,0,0,0.55)" />
        <Sheet.Handle
          height={4}
          rounded={999}
          bg="rgba(255,255,255,0.2)"
          opacity={1}
        />
        <Sheet.Frame
          bg={isDark ? "rgba(10,15,20,0.95)" : "$background"}
          borderTopLeftRadius={26}
          borderTopRightRadius={26}
          borderTopWidth={1}
          borderTopColor={isDark ? GLASS_BORDER : "transparent"}
          px="$5"
          pt="$4"
          pb="$8"
          borderWidth={0}
        >
          {children}
        </Sheet.Frame>
      </Theme>
    </Sheet>
  );
}
