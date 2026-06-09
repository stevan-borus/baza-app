import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { displayName } from "@baza/types";
import { useLocalAvatar } from "@/lib/use-local-avatar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { type Locale } from "@/lib/i18n";
import { updatePreferencesMutationOptions } from "@/lib/queries/notifications-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";
import { ProfileLegalSection } from "@/components/profile/profile-legal-section";
import { AppSheet } from "./sheet";
import { useThemeTokens } from "./tokens";

type ProfileSheetContextValue = {
  open: () => void;
  close: () => void;
};

const ProfileSheetContext = createContext<ProfileSheetContextValue | null>(null);

/**
 * Mount once at the screen-tree root. Provides a context hook
 * (`useProfileSheet`) so any descendant — including a tiny avatar inside the
 * AppHeader — can open the sheet without owning its mount point.
 *
 * Putting the sheet at the root avoids the gorhom layout pitfall where a
 * sheet rendered inside a 40pt-wide slot gets clipped.
 */
export function ProfileSheetProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<ProfileSheetContextValue>(
    () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [],
  );

  return (
    <ProfileSheetContext.Provider value={value}>
      {children}
      <ProfileSheetContent open={isOpen} onOpenChange={setIsOpen} />
    </ProfileSheetContext.Provider>
  );
}

export function useProfileSheet(): ProfileSheetContextValue {
  const ctx = useContext(ProfileSheetContext);
  if (!ctx) {
    // No provider in tree — degrade gracefully (e.g. on unauthenticated screens).
    return { open: () => {}, close: () => {} };
  }
  return ctx;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ProfileSheetContent({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();

  const meQuery = useQuery(authQueries.me());
  const email = meQuery.data?.user.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();
  const { avatarUri, setAvatarUri } = useLocalAvatar();

  async function handlePickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    setAvatarUri(uri);
  }

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOutWithPushCleanup();
    },
    onSuccess: () => {
      queryClient.clear();
      onOpenChange(false);
      router.replace("/sign-in");
    },
  });

  const updateLocalePrefsMutation = useMutation(updatePreferencesMutationOptions(queryClient));

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="gap-6">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={handlePickAvatar}
            hitSlop={6}
            android_ripple={null}
            className="active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={t("client.profileTab.changePhoto")}
          >
            <View className="relative">
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={{ width: 56, height: 56, borderRadius: 28 }}
                />
              ) : (
                <View
                  className="rounded-full bg-foreground items-center justify-center"
                  style={{ width: 56, height: 56 }}
                >
                  <Text
                    className="font-body-semibold text-background"
                    style={{ fontSize: 20 }}
                  >
                    {initial}
                  </Text>
                </View>
              )}
              <View
                className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-foreground items-center justify-center"
                style={{ borderWidth: 2, borderColor: tokens.background }}
              >
                <Icon name="camera" size={11} color={tokens.background} />
              </View>
            </View>
          </Pressable>
          <View className="flex-1">
            <Text
              testID="profile-sheet-display-name"
              className="text-foreground font-body-semibold"
              style={{ fontSize: 16 }}
            >
              {displayName(meQuery.data?.user) || t("client.profileTab.account")}
            </Text>
            <Text className="text-muted" style={{ fontSize: 13 }}>
              {email}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-muted text-xs uppercase" style={{ letterSpacing: 0.5 }}>
            {t("settings.theme")}
          </Text>
          <ThemeSwitcher />
        </View>

        <View className="gap-2">
          <Text className="text-muted text-xs uppercase" style={{ letterSpacing: 0.5 }}>
            {t("settings.language")}
          </Text>
          <LanguageSwitcher
            onSelectLocale={(locale: Locale) => {
              updateLocalePrefsMutation.mutate({ preferredLocale: locale });
            }}
          />
        </View>

        {meQuery.data?.user.role !== "CLIENT" ? (
          <ProfileLegalSection />
        ) : null}

        <Pressable
          testID="profile-sign-out-button"
          onPress={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
          className="flex-row items-center justify-center py-3 px-4 rounded-2xl"
          style={{
            backgroundColor: tokens.dangerSoft,
            borderWidth: 1,
            borderColor: tokens.danger,
            opacity: signOutMutation.isPending ? 0.5 : 1,
          }}
        >
          <Icon name="sign-out" size={15} color={tokens.danger} />
          <Text
            style={{
              color: tokens.danger,
              fontSize: 15,
              fontWeight: "600",
              marginLeft: 8,
            }}
          >
            {t("client.signOut")}
          </Text>
        </Pressable>
      </View>
    </AppSheet>
  );
}

/** Legacy export — kept so older imports don't break. Most callers should use `<ProfileSheetProvider>` + `useProfileSheet()` instead. */
export const ProfileSheet = ProfileSheetContent;
