import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useLocalAvatar } from "@/lib/use-local-avatar";
import { useThemeTokens } from "./tokens";
import { useProfileSheet } from "./profile-sheet";

const AVATAR_SIZE = 36;

/**
 * Circular avatar for the AppHeader's left slot. Tapping it opens the
 * global ProfileSheet. Theme-aware: reads `useLocalAvatar()` and adds a
 * subtle glass-border ring when an image is set (otherwise photographic
 * avatars float without a defined edge against the surrounding canvas).
 */
export function UserAvatar() {
  const meQuery = useQuery(authQueries.me());
  const email = meQuery.data?.user.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();
  const { open } = useProfileSheet();
  const { avatarUri } = useLocalAvatar();
  const tokens = useThemeTokens();

  return (
    <Pressable
      testID="open-profile-sheet"
      onPress={open}
      hitSlop={12}
      android_ripple={null}
      className="active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel="Open profile menu"
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            borderWidth: 1,
            borderColor: tokens.glassBorder,
          }}
        />
      ) : (
        <View
          className="rounded-full bg-foreground items-center justify-center"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
        >
          <Text
            className="font-body-semibold text-background"
            style={{ fontSize: 13 }}
          >
            {initial}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
