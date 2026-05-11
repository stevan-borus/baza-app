/**
 * Izveštaji → Paketi sub-page (P3-1 scaffold).
 *
 * Structure-only stub. P3-5 fills this in with most-used packages, revenue
 * per type, and the comp-vs-paid split. The "Aktivne dodele" link here
 * mirrors the row that lived on the old single-page reports — kept reachable
 * during the transition so admins can still get to the assignments list.
 */
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Feather from "@expo/vector-icons/Feather";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";

export default function IzvestajiPaketi() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.sections.paketi")}
      rightSlot={<AvatarMenu />}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
        <View className="py-8 items-center">
          <Text className="text-muted" style={{ fontSize: 14 }}>
            {t("admin.izvestaji.placeholder")}
          </Text>
        </View>

        <Pressable
          testID="paketi-active-assignments-link"
          onPress={() => router.push("/(admin)/izvestaji/paketi/aktivne-dodele")}
          android_ripple={null}
          style={{ borderRadius: 14 }}
        >
          <GlassCard size="md">
            <View className="flex-row items-center gap-3">
              <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
                <Feather name="users" size={16} color={tokens.accent} />
              </View>
              <Text className="flex-1 text-foreground font-body-semibold" style={{ fontSize: 15 }}>
                {t("admin.izvestaji.paketi.activeAssignmentsLink")}
              </Text>
              <Feather name="chevron-right" size={16} color={tokens.faint} />
            </View>
          </GlassCard>
        </Pressable>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
