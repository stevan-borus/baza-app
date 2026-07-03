// Initials avatar shared by the klijenti list rows and the client-actions
// sheet. Moved verbatim from app/(admin)/klijenti/index.tsx during the
// client-flows extraction.

import React from "react";
import { Text, View } from "react-native";

export function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
      <Text className="text-accent font-body-bold" style={{ fontSize: 14 }}>
        {initials}
      </Text>
    </View>
  );
}
