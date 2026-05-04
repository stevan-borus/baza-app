import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useLocalAvatar } from "@/lib/use-local-avatar";
import { useProfileSheet } from "./profile-sheet";

const AVATAR_SIZE = 36;

/**
 * Circular avatar for the AppHeader's left slot. Tapping it opens the
 * global ProfileSheet. Theme-aware and reads the locally-uploaded image
 * from `useLocalAvatar()` (shared with the profile page + sheet so all
 * three render the same image).
 */
export function UserAvatar() {
  const meQuery = useQuery(authQueries.me());
  const email = meQuery.data?.user.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();
  const { open } = useProfileSheet();
  const { avatarUri } = useLocalAvatar();

  return (
    <Pressable
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
