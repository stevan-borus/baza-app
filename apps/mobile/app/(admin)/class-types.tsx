/**
 * Admin Settings — Class Types management screen.
 * Design references (from docs/inspiration/):
 * - Linear Mobile ios Apr 2026/ — glass list rows with icon + meta
 * - Apple Fitness ios Feb 2026/ — colored-dot category indicator
 *
 * Each class type is rendered as a GlassCard row:
 *   colored dot  |  name  |  duration · max  |  chevron / action
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { SectionLabel } from "@/components/ui/typography";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";

// Palette of dot colors for class types (cycled by index)
const DOT_COLORS = [
  "#4a8c6b", // accent green
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export default function AdminSettingsClassTypes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
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

  const classTypes = classTypesQuery.data?.classTypes ?? [];

  return (
    <ScreenContainerRaw
      title={t("admin.manage.classTypes")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("admin.manage.sheetNewClassType")}
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
      >
      {/* Section label */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350 }}
      >
        <View className="flex-row items-center justify-between mb-1">
          <SectionLabel>
            {t("admin.manage.classTypes")} · {classTypes.length}
          </SectionLabel>
        </View>
      </MotiView>

      {/* Class type list */}
      {classTypes.map((ct, idx) => (
        <MotiView
          key={ct.id}
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: idx * 60 }}
        >
          <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
            <View className="flex-row items-center px-4 py-3.5 gap-3.5">
              {/* Colored dot indicator */}
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: DOT_COLORS[idx % DOT_COLORS.length],
                }}
              />

              {/* Name */}
              <Text
                className="text-foreground font-body-medium flex-1"
                style={{ fontSize: 16 }}
                numberOfLines={1}
              >
                {ct.name}
              </Text>

              {/* Meta: duration · capacity */}
              <View className="flex-row items-center gap-3">
                <View className="flex-row items-center gap-1">
                  <FontAwesome name="clock-o" size={11} color="#a1a1aa" />
                  <Text className="text-muted" style={{ fontSize: 12 }}>
                    {ct.durationMins}min
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <FontAwesome name="users" size={11} color="#a1a1aa" />
                  <Text className="text-muted" style={{ fontSize: 12 }}>
                    {ct.maxClients}
                  </Text>
                </View>
              </View>
            </View>
          </GlassCard>
        </MotiView>
      ))}

      {classTypes.length === 0 && !classTypesQuery.isLoading && (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 400, delay: 80 }}
        >
          <View className="items-center py-12">
            <FontAwesome name="list" size={32} color="#3f3f46" />
            <Text className="text-muted mt-3" style={{ fontSize: 14 }}>
              {t("admin.manage.classTypes")}
            </Text>
          </View>
        </MotiView>
      )}

      {/* Create sheet */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetNewClassType")}
          </Text>
          <Input
            testID="class-type-name-input"
            placeholder={t("admin.manage.placeholderName")}
            value={form.name}
            onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
          />
          <Input
            testID="class-type-max-clients-input"
            placeholder={t("admin.manage.placeholderMaxClients")}
            keyboardType="numeric"
            value={form.maxClients}
            onChangeText={(v) => setForm((s) => ({ ...s, maxClients: v }))}
          />
          <Input
            testID="class-type-duration-input"
            placeholder={t("admin.manage.placeholderDurationMins")}
            keyboardType="numeric"
            value={form.durationMins}
            onChangeText={(v) => setForm((s) => ({ ...s, durationMins: v }))}
          />
          <Button
            testID="class-type-create-submit"
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
    </ScreenContainerRaw>
  );
}
