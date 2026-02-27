import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, YStack } from "tamagui";
import { ActionButton } from "@/components/ui/action-button";
import { AppSheet } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";

export default function AdminPackages() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sessionCount: "",
    validityDays: "",
    lateCancelHours: "12",
  });

  const typesQuery = useQuery(packagesQueries.types());
  const createMutation = useMutation({
    ...packagesQueries.createType(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages", "types"] });
      setShowCreate(false);
      setForm({
        name: "",
        sessionCount: "",
        validityDays: "",
        lateCancelHours: "12",
      });
    },
  });

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 12,
        paddingHorizontal: 24,
        paddingBottom: TAB_BAR_HEIGHT + 16,
        gap: 16,
      }}
    >
      <ActionButton
        icon="plus"
        label={t("admin.manage.newPackageType")}
        onPress={() => setShowCreate(true)}
      />
      {typesQuery.isError ? (
        <ErrorState message={t("admin.manage.packagesError")} />
      ) : null}
      {(typesQuery.data?.packageTypes ?? []).length === 0 ? (
        <EmptyState title={t("admin.manage.packagesEmpty")} />
      ) : null}
      {(typesQuery.data?.packageTypes ?? []).map((pt) => (
        <Card key={pt.id}>
          <YStack gap="$1">
            <Text fontWeight="600" fontSize="$3" color="$color">
              {pt.name}
            </Text>
            <Text fontSize="$2" color="$color10">
              {t("admin.manage.sessionsDays", {
                count: pt.sessionCount,
                days: pt.validityDays,
              })}
            </Text>
            <Text fontSize="$2" color="$color9">
              {t("admin.manage.lateCancel", { hours: pt.lateCancelHours })}
            </Text>
          </YStack>
        </Card>
      ))}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <YStack gap="$4">
          <Text
            fontSize="$6"
            fontWeight="700"
            color="$color"
            letterSpacing={-0.3}
          >
            {t("admin.manage.sheetNewPackage")}
          </Text>
          <Input
            placeholder={t("admin.manage.placeholderName")}
            value={form.name}
            onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderSessionCount")}
            keyboardType="numeric"
            value={form.sessionCount}
            onChangeText={(v) => setForm((s) => ({ ...s, sessionCount: v }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderValidityDays")}
            keyboardType="numeric"
            value={form.validityDays}
            onChangeText={(v) => setForm((s) => ({ ...s, validityDays: v }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderLateCancel")}
            keyboardType="numeric"
            value={form.lateCancelHours}
            onChangeText={(v) =>
              setForm((s) => ({ ...s, lateCancelHours: v }))
            }
          />
          <Button
            disabled={
              createMutation.isPending ||
              !form.name ||
              !form.sessionCount ||
              !form.validityDays
            }
            onPress={() =>
              createMutation.mutate({
                name: form.name,
                sessionCount: parseInt(form.sessionCount, 10),
                validityDays: parseInt(form.validityDays, 10),
                lateCancelHours: parseInt(form.lateCancelHours, 10) || 12,
              })
            }
          >
            {t("admin.manage.create")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("admin.manage.createPackageError")} />
          ) : null}
        </YStack>
      </AppSheet>
    </ScrollView>
  );
}
