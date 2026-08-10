/**
 * Katalog landing — editorial split with two caps-overline sections.
 *
 * KREIRAJ → single hero GlassCard row that opens NewSessionSheet.
 * KATALOG → three hairline-divided rows that push to the three
 *   catalog-management sub-screens (Tipovi treninga / Sale / Tipovi paketa).
 *
 * Design references:
 * - Linear Mobile ios Apr 2026/ — hairline list rows under caps overlines
 * - Stripe Dashboard ios Jun 2023/ — editorial section split, no chrome
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "@/components/ui/icon";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";
import { GlassCard } from "@/components/ui/glass-card";
import { CapsLabel } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import { NewSessionSheet } from "@/components/admin/new-session-sheet";

export default function KatalogLanding() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <ScreenContainerRaw title={t("tabs.catalog")} leftSlot={<AdminTabLeftSlot />}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomPad }}
      >
        {/* ── KREIRAJ section ─────────────────────────────────────────── */}
        <View className="px-5 pb-3">
          <CapsLabel size={12} tracking={2.4} className="text-muted">
            {t("admin.katalog.sections.kreiraj")}
          </CapsLabel>
        </View>
        <View className="px-5">
          <GlassCard
            accentBorder="left"
            accentBorderColor={tokens.accent}
            style={{ paddingVertical: 16 }}
          >
            <Pressable
              testID="katalog-novi-termin"
              onPress={() => setShowCreate(true)}
              android_ripple={null}
              className="flex-row items-center gap-3 active:opacity-60"
              accessibilityRole="button"
              accessibilityLabel={t("admin.katalog.noviTermin")}
            >
              <Icon name="plus" size={18} color={tokens.foreground} />
              <View className="flex-1">
                <Text
                  className="text-foreground font-body-semibold"
                  style={{ fontSize: 15 }}
                >
                  {t("admin.katalog.noviTermin")}
                </Text>
                <Text className="text-xs text-muted">
                  {t("admin.katalog.noviTerminSub")}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={tokens.faint} />
            </Pressable>
          </GlassCard>
        </View>

        {/* ── KATALOG section ─────────────────────────────────────────── */}
        <View className="px-5 pt-6 pb-3">
          <CapsLabel size={12} tracking={2.4} className="text-muted">
            {t("admin.katalog.sections.katalog")}
          </CapsLabel>
        </View>
        <View className="mx-5 border-t border-b border-glass-border">
          <Pressable
            testID="katalog-row-class-types"
            onPress={() => router.push("/(admin)/katalog/tipovi-treninga")}
            android_ripple={null}
            className="flex-row items-center justify-between py-4 active:opacity-60"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Icon name="list" size={16} color={tokens.muted} />
              <Text
                className="text-foreground font-body-medium"
                style={{ fontSize: 15 }}
              >
                {t("admin.manage.classTypes")}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={tokens.faint} />
          </Pressable>
          <View className="bg-glass-border" style={{ height: 1 }} />
          <Pressable
            testID="katalog-row-rooms"
            onPress={() => router.push("/(admin)/katalog/sale")}
            android_ripple={null}
            className="flex-row items-center justify-between py-4 active:opacity-60"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Icon name="home" size={16} color={tokens.muted} />
              <Text
                className="text-foreground font-body-medium"
                style={{ fontSize: 15 }}
              >
                {t("admin.manage.rooms")}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={tokens.faint} />
          </Pressable>
          <View className="bg-glass-border" style={{ height: 1 }} />
          <Pressable
            testID="katalog-row-package-types"
            onPress={() => router.push("/(admin)/katalog/tipovi-paketa")}
            android_ripple={null}
            className="flex-row items-center justify-between py-4 active:opacity-60"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Icon name="package" size={16} color={tokens.muted} />
              <Text
                className="text-foreground font-body-medium"
                style={{ fontSize: 15 }}
              >
                {t("admin.manage.packageTypes")}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={tokens.faint} />
          </Pressable>
          <View className="bg-glass-border" style={{ height: 1 }} />
          <Pressable
            testID="katalog-row-campaigns"
            onPress={() => router.push("/(admin)/katalog/kampanje")}
            android_ripple={null}
            className="flex-row items-center justify-between py-4 active:opacity-60"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Icon name="bell" size={16} color={tokens.muted} />
              <Text
                className="text-foreground font-body-medium"
                style={{ fontSize: 15 }}
              >
                {t("campaigns.navRow")}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={tokens.faint} />
          </Pressable>
          <View className="bg-glass-border" style={{ height: 1 }} />
          <Pressable
            testID="katalog-row-trainer-rates"
            onPress={() => router.push("/(admin)/katalog/procenti-trenera")}
            android_ripple={null}
            className="flex-row items-center justify-between py-4 active:opacity-60"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Icon name="dollar-sign" size={16} color={tokens.muted} />
              <Text
                className="text-foreground font-body-medium"
                style={{ fontSize: 15 }}
              >
                {t("payroll.ratesTitle")}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={tokens.faint} />
          </Pressable>
        </View>
      </ScrollView>

      <NewSessionSheet open={showCreate} onOpenChange={setShowCreate} />
    </ScreenContainerRaw>
  );
}
