/**
 * Izveštaji → Prihod sub-page (P3-1 scaffold).
 *
 * Structure-only stub. P3-2 fills this in with the revenue chart and per-tier
 * / per-package breakdowns plus the source-side returnTo wiring into Naplata.
 */
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";

export default function IzvestajiPrihod() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.sections.prihod")}
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
        <View className="py-12 items-center">
          <Text className="text-muted" style={{ fontSize: 14 }}>
            {t("admin.izvestaji.placeholder")}
          </Text>
        </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
