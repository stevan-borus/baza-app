import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { type Locale } from "@/lib/i18n";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";
import { useSessionAuth } from "@/lib/session-auth";
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
  const { role } = useSessionAuth();

  const meQuery = useQuery(authQueries.me());
  const email = meQuery.data?.user.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();

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

  const updateLocalePrefsMutation = useMutation({
    ...notificationsQueries.updatePreferences(),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["notifications", "preferences"],
      }),
  });

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="gap-6">
        <View className="flex-row items-center gap-3">
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: tokens.accentSoft,
              borderWidth: 1,
              borderColor: tokens.accentLight,
            }}
            className="items-center justify-center"
          >
            <Text style={{ color: tokens.accentLight, fontSize: 18, fontWeight: "600" }}>
              {initial}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-body-semibold" style={{ fontSize: 16 }}>
              {email.split("@")[0] || t("client.profileTab.account")}
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

        <Pressable
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
          <FontAwesome name="sign-out" size={15} color={tokens.danger} />
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
