/**
 * Izveštaji → Rezervacije sub-page (P3-1 scaffold).
 *
 * Structure-only stub. P3-4 fills this in with the bookings chart and the
 * popular-classes ranked list.
 */
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";

export default function IzvestajiRezervacije() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.sections.rezervacije")}
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
