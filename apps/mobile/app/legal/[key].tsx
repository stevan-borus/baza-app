// apps/mobile/app/legal/[key].tsx
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { legalQueries } from "@/lib/queries/legal-queries-factory";
import { LegalDocumentViewer } from "@/components/consent/legal-document-viewer";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import type { ConsentDocumentKey } from "@baza/types";

const ALLOWED_KEYS: ConsentDocumentKey[] = [
  "tos",
  "privacy",
  "waiver_adult",
  "waiver_minor",
];

export default function LegalDocumentScreen() {
  const { t, i18n } = useTranslation();
  const { key } = useLocalSearchParams<{ key: string }>();
  const lang = i18n.language === "en" ? "en" : "sr";

  const isValidKey =
    typeof key === "string" && (ALLOWED_KEYS as string[]).includes(key);
  const docKey = isValidKey ? (key as ConsentDocumentKey) : null;

  const docQuery = useQuery({
    ...legalQueries.byKey(docKey ?? "tos", lang),
    enabled: !!docKey,
  });

  return (
    <ScreenContainerRaw title={t("legal.viewerTitle")} headerVariant="detail">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        {!docKey ? (
          <Text className="text-danger">{t("legal.loadError")}</Text>
        ) : docQuery.isLoading ? (
          <View className="flex-1" />
        ) : docQuery.isError || !docQuery.data ? (
          <Text className="text-danger">{t("legal.loadError")}</Text>
        ) : (
          <LegalDocumentViewer body={docQuery.data.body} />
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
