import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("notFound.title") }} />
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Text
          className="text-[30px] font-body-bold text-foreground"
          style={{ letterSpacing: -0.4 }}
        >
          404
        </Text>
        <Text className="text-base text-muted text-center">
          {t("notFound.message")}
        </Text>
        <Link href="/">
          <Text className="text-accent text-base font-body-semibold">
            {t("notFound.goHome")}
          </Text>
        </Link>
      </View>
    </>
  );
}
