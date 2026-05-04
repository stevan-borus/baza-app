import React, { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useProfileSheet } from "./profile-sheet";

const AVATAR_SIZE = 36;
const AVATAR_STORAGE_KEY = "baza.avatar.localUri";

/**
 * Circular avatar for the AppHeader's left slot. Tapping it opens the
 * global ProfileSheet. Theme-aware: foreground/background tokens swap
 * between light and dark. Renders the user's locally-uploaded image
 * if present, otherwise the email initial.
 */
export function UserAvatar() {
  const meQuery = useQuery(authQueries.me());
  const email = meQuery.data?.user.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();
  const { open } = useProfileSheet();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(AVATAR_STORAGE_KEY)
      .then((uri) => {
        if (mounted && uri) setAvatarUri(uri);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

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
