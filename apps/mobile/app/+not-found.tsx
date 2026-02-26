import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, YStack } from "tamagui";

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("notFound.title") }} />
      <YStack flex={1} bg="$background" items="center" justify="center" px="$6" gap="$4">
        <Text fontSize="$7" fontWeight="700" color="$color" letterSpacing={-0.4}>
          404
        </Text>
        <Text fontSize="$3" color="$color10" text="center">
          {t("notFound.message")}
        </Text>
        <Link href="/">
          <Text color="$accent1" fontSize="$3" fontWeight="600">
            {t("notFound.goHome")}
          </Text>
        </Link>
      </YStack>
    </>
  );
}
