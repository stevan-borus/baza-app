/**
 * Admin Settings — Class Types management screen.
 * Design references (from docs/inspiration/):
 * - Linear Mobile ios Apr 2026/ — glass list rows with icon + meta
 * - Apple Fitness ios Feb 2026/ — colored-dot category indicator
 *
 * Each class type is rendered as a GlassCard row:
 *   colored dot  |  name  |  duration · max  |  chevron / action
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { SectionLabel } from "@/components/ui/typography";
import {
  trainingsQueries,
  createClassTypeMutationOptions,
  updateClassTypeMutationOptions,
} from "@/lib/queries/trainings-queries-factory";
import { findSimilarClassTypeName } from "@/lib/admin/class-type-name-similarity";
import { useAdminCrud } from "@/lib/admin/use-admin-crud";
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

  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  // Cache upkeep (list splice / invalidation) stays in the factory options;
  // the sheet choreography (open/close/reset) lives in the CRUD machine.
  const crud = useAdminCrud({
    empty: { name: "", maxClients: "", durationMins: "" },
    toForm: (ct: { id: string; name: string; maxClients: number; durationMins: number }) => ({
      name: ct.name,
      maxClients: String(ct.maxClients),
      durationMins: String(ct.durationMins),
    }),
    create: createClassTypeMutationOptions(queryClient),
    update: updateClassTypeMutationOptions(queryClient),
    remove: {
      ...trainingsQueries.deleteClassType(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trainingsQueries.all });
      },
    },
  });

  const classTypes = classTypesQuery.data?.classTypes ?? [];

  // Non-blocking duplicate guard: "Reformer pilates 8" next to "Reformer
  // pilates 12" fences 8-pack clients out of the shared schedule (a real
  // staging incident). Warn while typing; the admin can still create.
  const similarClassTypeName = findSimilarClassTypeName(
    crud.form.name,
    classTypes.map((ct) => ct.name),
  );

  // Same guard on the EDIT sheet — a rename can create the duplicate just as
  // easily as a create. Exclude the class type being edited from the
  // comparison set so its own current name never self-matches.
  const similarEditClassTypeName = crud.editingId
    ? findSimilarClassTypeName(
        crud.editForm.name,
        classTypes
          .filter((ct) => ct.id !== crud.editingId)
          .map((ct) => ct.name),
      )
    : null;

  return (
    <ScreenContainerRaw
      title={t("admin.manage.classTypes")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={crud.openCreate}
          accessibilityLabel={t("admin.manage.sheetNewClassType")}
          testID="admin-new-class-type-button"
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

      {/* Loading skeletons */}
      {classTypesQuery.isLoading ? (
        <View style={{ gap: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {/* Class type list */}
      {classTypes.map((ct, idx) => (
        <MotiView
          key={ct.id}
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: idx * 60 }}
        >
          <Pressable
            testID={`class-type-row-${ct.id}`}
            onPress={() => crud.openEdit(ct)}
            android_ripple={null}
            className="active:opacity-70"
          >
            <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
              <View className="flex-row items-center px-4 py-3.5 gap-3.5">
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
                    <Icon name="clock-o" size={11} color="#a1a1aa" />
                    <Text className="text-muted" style={{ fontSize: 12 }}>
                      {ct.durationMins}min
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Icon name="users" size={11} color="#a1a1aa" />
                    <Text className="text-muted" style={{ fontSize: 12 }}>
                      {ct.maxClients}
                    </Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          </Pressable>
        </MotiView>
      ))}

      {classTypes.length === 0 && !classTypesQuery.isLoading && (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 400, delay: 80 }}
        >
          <View className="items-center py-12">
            <Icon name="list" size={32} color="#3f3f46" />
            <Text className="text-muted mt-3" style={{ fontSize: 14 }}>
              {t("admin.manage.classTypes")}
            </Text>
          </View>
        </MotiView>
      )}

      {/* Create sheet */}
      <AppSheet open={crud.showCreate} onOpenChange={crud.onCreateOpenChange}>
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
            value={crud.form.name}
            onChangeText={(v) => crud.setForm({ name: v })}
          />
          {/* The structure rule, right where names get typed: class type =
              what's on the schedule; product size/price = package type. */}
          <Text className="text-muted" style={{ fontSize: 12, lineHeight: 17, marginTop: -8 }}>
            {t("admin.manage.classTypeNameHelper")}
          </Text>
          {similarClassTypeName ? (
            <View
              testID="class-type-similar-warning"
              className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
            >
              <Icon name="exclamation-circle" size={16} color="#a17d3a" />
              <Text className="flex-1 text-warning font-body-medium" style={{ fontSize: 13, lineHeight: 18 }}>
                {t("admin.manage.classTypeSimilarWarning", {
                  name: similarClassTypeName,
                })}
              </Text>
            </View>
          ) : null}
          <Input
            testID="class-type-max-clients-input"
            placeholder={t("admin.manage.placeholderMaxClients")}
            keyboardType="numeric"
            value={crud.form.maxClients}
            onChangeText={(v) => crud.setForm({ maxClients: v })}
          />
          <Input
            testID="class-type-duration-input"
            placeholder={t("admin.manage.placeholderDurationMins")}
            keyboardType="numeric"
            value={crud.form.durationMins}
            onChangeText={(v) => crud.setForm({ durationMins: v })}
          />
          <Button
            testID="class-type-create-submit"
            disabled={crud.createMutation.isPending || !crud.form.name}
            onPress={() =>
              crud.submitCreate({
                name: crud.form.name.trim(),
                maxClients: parseInt(crud.form.maxClients, 10) || 8,
                durationMins: parseInt(crud.form.durationMins, 10) || 60,
              })
            }
          >
            {t("admin.manage.create")}
          </Button>
          {crud.createMutation.isError ? (
            <ErrorState message={t("admin.manage.createError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* Edit sheet */}
      <AppSheet open={!!crud.editingId} onOpenChange={crud.onEditOpenChange} stackBehavior="push">
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetEditClassType")}
          </Text>
          <Input
            testID="class-type-edit-name-input"
            placeholder={t("admin.manage.placeholderName")}
            value={crud.editForm.name}
            onChangeText={(v) => crud.setEditForm({ name: v })}
          />
          {similarEditClassTypeName ? (
            <View
              testID="class-type-edit-similar-warning"
              className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
            >
              <Icon name="exclamation-circle" size={16} color="#a17d3a" />
              <Text className="flex-1 text-warning font-body-medium" style={{ fontSize: 13, lineHeight: 18 }}>
                {t("admin.manage.classTypeSimilarWarning", {
                  name: similarEditClassTypeName,
                })}
              </Text>
            </View>
          ) : null}
          <Input
            testID="class-type-edit-max-clients-input"
            placeholder={t("admin.manage.placeholderMaxClients")}
            keyboardType="numeric"
            value={crud.editForm.maxClients}
            onChangeText={(v) => crud.setEditForm({ maxClients: v })}
          />
          <Input
            testID="class-type-edit-duration-input"
            placeholder={t("admin.manage.placeholderDurationMins")}
            keyboardType="numeric"
            value={crud.editForm.durationMins}
            onChangeText={(v) => crud.setEditForm({ durationMins: v })}
          />
          <Button
            testID="class-type-edit-save-button"
            disabled={crud.updateMutation.isPending || !crud.editForm.name}
            onPress={() => {
              if (!crud.editingId) return;
              crud.submitUpdate({
                id: crud.editingId,
                name: crud.editForm.name.trim(),
                maxClients: parseInt(crud.editForm.maxClients, 10) || 8,
                durationMins: parseInt(crud.editForm.durationMins, 10) || 60,
              });
            }}
          >
            {t("admin.schedule.saveChanges")}
          </Button>
          <Button
            testID="class-type-edit-delete-button"
            variant="danger"
            disabled={crud.removeMutation.isPending || !crud.editingId}
            onPress={crud.askDelete}
          >
            {t("confirm.deleteClassTypeConfirm")}
          </Button>
          {crud.updateMutation.isError ? (
            <ErrorState
              message={
                (crud.updateMutation.error as Error)?.message ??
                t("admin.manage.createError")
              }
            />
          ) : null}
        </View>
      </AppSheet>
      <ConfirmSheet
        stackBehavior="push"
        open={crud.confirmDelete}
        onOpenChange={crud.onDeleteOpenChange}
        title={t("confirm.deleteClassTypeTitle")}
        message={t("confirm.deleteClassTypeMessage")}
        confirmLabel={t("confirm.deleteClassTypeConfirm")}
        loading={crud.removeMutation.isPending}
        testID="class-type-delete-confirm-button"
        errorMessage={
          crud.removeMutation.isError
            ? (crud.removeMutation.error as Error)?.message ?? null
            : null
        }
        onConfirm={() => {
          if (!crud.editingId) return;
          crud.submitDelete(crud.editingId);
        }}
      />
      </ScrollView>
    </ScreenContainerRaw>
  );
}
