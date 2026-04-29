import React from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useProfileSheet } from "./profile-sheet";

const AVATAR_SIZE = 32;

/**
 * Circular initial badge for the AppHeader's left slot. Tapping it opens
 * the global ProfileSheet (mounted once at the screen root, opened via context).
 */
export function UserAvatar() {
  const meQuery = useQuery(authQueries.me());
  const email = meQuery.data?.user.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();
  const { open } = useProfileSheet();

  return (
    <Pressable
      onPress={open}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Open profile menu"
    >
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          backgroundColor: "rgba(255,255,255,0.15)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.20)",
        }}
        className="items-center justify-center"
      >
        <Text
          style={{
            color: "rgba(255,255,255,0.95)",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {initial}
        </Text>
      </View>
    </Pressable>
  );
}
