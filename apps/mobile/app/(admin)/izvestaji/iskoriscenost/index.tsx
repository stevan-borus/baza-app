/**
 * Izveštaji → Iskorišćenost sub-page (P3-1 scaffold).
 *
 * Structure-only stub. P3-3 fills this in with the utilization ring, the
 * day-of-week × hour heatmap, and the trend chart.
 */
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";

export default function IzvestajiIskoriscenost() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.sections.iskoriscenost")}
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
