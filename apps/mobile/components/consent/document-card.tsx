import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { LegalDocumentViewer } from "./legal-document-viewer";
import { legalQueries } from "@/lib/queries/legal-queries-factory";
import type { ConsentDocumentKey } from "@baza/types";

type Props = {
  documentKey: ConsentDocumentKey;
  locale: "sr" | "en";
  accepted: boolean;
  onAcceptedChange: (next: boolean) => void;
};

const DOC_LABEL_KEY: Record<ConsentDocumentKey, string> = {
  tos: "consent.documentTos",
  privacy: "consent.documentPrivacy",
  eula: "consent.documentEula",
  waiver_adult: "consent.documentWaiverAdult",
  waiver_minor: "consent.documentWaiverMinor",
};

export function DocumentCard({ documentKey, locale, accepted, onAcceptedChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const docQuery = useQuery({ ...legalQueries.byKey(documentKey, locale), enabled: open });

  const label = t(DOC_LABEL_KEY[documentKey]);
  return (
    <View className="px-6">
      <GlassCard size="md">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[15px] text-foreground font-body-semibold">{label}</Text>
            <Pressable
              onPress={() => setOpen(true)}
              testID={`document-card-read-${documentKey}`}
              hitSlop={8}
            >
              <Text className="text-[12px] text-muted underline mt-0.5">
                {t("consent.readFullDocument")}
              </Text>
            </Pressable>
          </View>
          <Switch
            testID={`document-card-accept-${documentKey}`}
            value={accepted}
            onValueChange={onAcceptedChange}
          />
        </View>
      </GlassCard>

      {/*
       * rawContent={true}: LegalDocumentViewer mounts its own ScrollView.
       * Without rawContent, AppSheet wraps in BottomSheetScrollView, which
       * causes gesture conflict — the inner ScrollView captures pan events and
       * the sheet body stops scrolling. rawContent lets LegalDocumentViewer's
       * ScrollView own all vertical pan gestures directly.
       */}
      <AppSheet open={open} onOpenChange={setOpen} rawContent>
        <View style={{ minHeight: 480 }}>
          <Text className="text-foreground font-body-bold px-6 pt-2" style={{ fontSize: 20 }}>
            {label}
          </Text>
          {docQuery.data ? (
            <LegalDocumentViewer body={docQuery.data.body} />
          ) : docQuery.isError ? (
            <Text className="text-danger px-6 py-4">{t("legal.loadError")}</Text>
          ) : (
            <Text className="text-muted px-6 py-4">…</Text>
          )}
        </View>
      </AppSheet>
    </View>
  );
}
