import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, ListRow } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { SectionHeader } from "@/components/ui/typography";
import { HEADER_HEIGHT, TAB_BAR_HEIGHT } from "@/components/ui/constants";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";

export default function AdminSettingsClassTypes() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    maxClients: "",
    durationMins: "",
  });

  const classTypesQuery = useQuery(trainingsQueries.classTypes());
  const createMutation = useMutation({
    ...trainingsQueries.createClassType(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setShowCreate(false);
      setForm({ name: "", maxClients: "", durationMins: "" });
    },
  });

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 28,
        paddingHorizontal: 24,
        paddingBottom: TAB_BAR_HEIGHT + 16,
        gap: 16,
      }}
    >
      <SectionHeader title={t("admin.manage.classTypes")} />
      <ActionButton
        icon="plus"
        label={t("admin.manage.sheetNewClassType")}
        onPress={() => setShowCreate(true)}
      />
      {(classTypesQuery.data?.classTypes ?? []).map((ct) => (
        <Card key={ct.id}>
          <ListRow
            title={ct.name}
            subtitle={t("admin.manage.classTypeSummary", {
              duration: ct.durationMins,
              max: ct.maxClients,
            })}
          />
        </Card>
      ))}

      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetNewClassType")}
          </Text>
          <Input
            placeholder={t("admin.manage.placeholderName")}
            value={form.name}
            onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderMaxClients")}
            keyboardType="numeric"
            value={form.maxClients}
            onChangeText={(v) => setForm((s) => ({ ...s, maxClients: v }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderDurationMins")}
            keyboardType="numeric"
            value={form.durationMins}
            onChangeText={(v) => setForm((s) => ({ ...s, durationMins: v }))}
          />
          <Button
            disabled={createMutation.isPending || !form.name}
            onPress={() =>
              createMutation.mutate({
                name: form.name,
                maxClients: parseInt(form.maxClients, 10) || 8,
                durationMins: parseInt(form.durationMins, 10) || 60,
              })
            }
          >
            {t("admin.manage.create")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("admin.manage.createError")} />
          ) : null}
        </View>
      </AppSheet>
    </ScrollView>
  );
}
