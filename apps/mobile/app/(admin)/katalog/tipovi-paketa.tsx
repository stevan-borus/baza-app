// P2-T10: Admin packages — grouped sections (package types + active assignments) with
// GlassCard rows, FilterChip bar, avatar-style session-count icon, MotiView stagger,
// and create-package AppSheet preserved verbatim.

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionLabel } from "@/components/ui/typography";
import { Select } from "@/components/ui/select";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { useThemeTokens } from "@/components/ui/tokens";
import { FilterChip } from "@/components/ui/studio";
import { useRouter } from "expo-router";
import {
  packagesQueries,
  createPackageTypeMutationOptions,
  updatePackageTypeMutationOptions,
} from "@/lib/queries/packages-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { useAdminCrud } from "@/lib/admin/use-admin-crud";
import { fieldErrorsFromApiError } from "@/lib/api-errors";
import { formatRsd } from "@/lib/format";
import { isPriceInputValid, parsePriceInput } from "@/lib/price-input";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text className="text-danger" style={{ fontSize: 12, marginTop: -8 }}>
      {message}
    </Text>
  );
}

// ─── SessionCountIcon ─────────────────────────────────────────────────────────
// Circular badge used on package-type rows to display session count.

function SessionCountIcon({ count }: { count: number }) {
  return (
    <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
      <Text className="text-accent font-body-bold" style={{ fontSize: 14 }}>
        {count}
      </Text>
    </View>
  );
}

// ─── AssignmentAvatar ─────────────────────────────────────────────────────────
// Shows first 2 chars of the package type name as a visual stand-in for avatar.

function AssignmentAvatar({ name }: { name: string }) {
  const initials = (name ?? "??")
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
      <Text className="text-accent font-body-bold" style={{ fontSize: 13 }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Filter type ──────────────────────────────────────────────────────────────

type AssignmentFilter = "all" | "expiring" | "expired";

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdminPackages() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [refreshing, setRefreshing] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: packagesQueries.types().queryKey }),
      // broad 2-segment prefix — no factory member; intentional
      queryClient.invalidateQueries({ queryKey: ["packages", "client-packages"] }),
    ]);
    setRefreshing(false);
  }

  const router = useRouter();
  const typesQuery = useQuery(packagesQueries.types());
  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  // Cache upkeep (types-list splice / invalidation) stays in the factory
  // options; the sheet choreography (open/close/reset) lives in the CRUD
  // machine.
  const crud = useAdminCrud({
    empty: {
      name: "",
      sessionCount: "",
      validityDays: "",
      lateCancelHours: "8",
      price: "",
      classTypeId: "",
      isBirthdayGift: false,
    },
    toForm: (pt: {
      id: string;
      name: string;
      sessionCount: number;
      validityDays: number;
      lateCancelHours: number;
      price?: number | null;
      classTypeId: string;
      isBirthdayGift?: boolean;
    }) => ({
      name: pt.name,
      sessionCount: String(pt.sessionCount),
      validityDays: String(pt.validityDays),
      lateCancelHours: String(pt.lateCancelHours),
      price: pt.price != null ? String(pt.price) : "",
      classTypeId: pt.classTypeId,
      isBirthdayGift: pt.isBirthdayGift ?? false,
    }),
    create: createPackageTypeMutationOptions(queryClient),
    update: updatePackageTypeMutationOptions(queryClient),
    remove: {
      ...packagesQueries.deleteType(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: packagesQueries.types().queryKey });
      },
    },
  });

  const createFieldErrors = fieldErrorsFromApiError(crud.createMutation.error);
  const editFieldErrors = fieldErrorsFromApiError(crud.updateMutation.error);

  const FILTERS: { key: AssignmentFilter; labelKey: string }[] = [
    { key: "all", labelKey: "admin.manage.filterAll" },
    { key: "expiring", labelKey: "admin.manage.filterExpiring" },
    { key: "expired", labelKey: "admin.manage.filterExpired" },
  ];

  return (
    <ScreenContainerRaw
      title={t("tabs.packages")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={crud.openCreate}
          accessibilityLabel={t("admin.manage.sheetNewPackage")}
          testID="admin-new-package-button"
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
      >
      <View
        className="px-5 flex-col gap-4"
        style={{ paddingTop: 16, paddingBottom: bottomPad }}
      >

        {/* ── Package types section ─────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 80 }}
          style={{ gap: 10 }}
        >
          <SectionLabel>{t("admin.manage.packageTypes")}</SectionLabel>

          {typesQuery.isError ? (
            <ErrorState message={t("admin.manage.packagesError")} />
          ) : null}

          {typesQuery.isLoading ? (
            <View style={{ gap: 8 }}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : null}

          {!typesQuery.isError && !typesQuery.isLoading && (typesQuery.data?.packageTypes ?? []).length === 0 ? (
            <EmptyState title={t("admin.manage.packagesEmpty")} />
          ) : null}

          {(typesQuery.data?.packageTypes ?? []).length > 0 ? (
            <View className="bg-surface rounded-lg overflow-hidden">
              {(typesQuery.data?.packageTypes ?? []).map((pt, idx) => (
                <React.Fragment key={pt.id}>
                  {idx > 0 ? (
                    <View
                      className="bg-glass-border"
                      style={{ height: 1, marginLeft: 64 }}
                    />
                  ) : null}
                  <Pressable
                    testID={`package-type-row-${pt.id}`}
                    onPress={() => crud.openEdit(pt)}
                    android_ripple={null}
                    className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                  >
                    <SessionCountIcon count={pt.sessionCount} />
                    <View className="flex-1 gap-0.5">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className="text-foreground font-body-semibold"
                          style={{ fontSize: 15 }}
                          numberOfLines={1}
                        >
                          {pt.name}
                        </Text>
                        {pt.isBirthdayGift ? (
                          <Badge status="success">
                            🎂 {t("admin.manage.birthdayGiftBadge")}
                          </Badge>
                        ) : null}
                      </View>
                      {/* Class-type name dropped from this subtitle: it
                          duplicated the package name right above ("Reformer
                          12-pack") and truncated the price. The class type
                          stays load-bearing in the edit sheet's picker. */}
                      <Text
                        className="text-muted"
                        style={{ fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {t("admin.manage.sessionsDays", {
                          count: pt.sessionCount,
                          days: pt.validityDays,
                        })}
                        {pt.price != null ? ` · ${formatRsd(pt.price)}` : ""}
                      </Text>
                      <Text
                        className="text-faint"
                        style={{ fontSize: 11 }}
                        numberOfLines={1}
                      >
                        {t("admin.manage.lateCancel", {
                          hours: pt.lateCancelHours,
                        })}
                      </Text>
                    </View>
                    <Icon
                      name="chevron-right"
                      size={11}
                      color={tokens.faint}
                    />
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
          ) : null}
        </MotiView>

        {/* ── Link to standalone Aktivne dodele page ─────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 160 }}
          style={{ gap: 10 }}
        >
          <SectionLabel>{t("admin.manage.activeAssignments")}</SectionLabel>
          <Pressable
            testID="active-assignments-link"
            onPress={() => router.push("/(admin)/katalog/aktivne-dodele")}
            android_ripple={null}
            style={{ borderRadius: 14 }}
          >
            <GlassCard size="md">
              <View className="flex-row items-center gap-3">
                <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
                  <Icon name="users" size={16} color={tokens.accent} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-foreground font-body-semibold"
                    style={{ fontSize: 15 }}
                  >
                    {t("admin.manage.activeAssignmentsLinkLabel")}
                  </Text>
                  <Text className="text-muted" style={{ fontSize: 12 }}>
                    {t("admin.manage.activeAssignmentsLinkHint")}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={tokens.muted} />
              </View>
            </GlassCard>
          </Pressable>
        </MotiView>

        {/* ═══════════════════════════════════════════════════════════════════
            CREATE PACKAGE TYPE SHEET — preserved verbatim
        ═══════════════════════════════════════════════════════════════════ */}
        <AppSheet open={crud.showCreate} onOpenChange={crud.onCreateOpenChange}>
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
            >
              {t("admin.manage.sheetNewPackage")}
            </Text>
            <Input
              testID="package-name-input"
              placeholder={t("admin.manage.placeholderName")}
              value={crud.form.name}
              onChangeText={(v) => crud.setForm({ name: v })}
            />
            <FieldError message={createFieldErrors.name} />
            <Select
              testID="package-class-type-select"
              optionTestIDPrefix="package-class-type-option"
              placeholder={t("admin.packages.classType")}
              value={crud.form.classTypeId}
              onChange={(v) => crud.setForm({ classTypeId: v })}
              emptyText={t("admin.schedule.emptyClassTypes")}
              options={(classTypesQuery.data?.classTypes ?? []).map((ct) => ({
                value: ct.id,
                label: ct.name,
              }))}
            />
            <FieldError message={createFieldErrors.classTypeId} />
            <Input
              testID="package-session-count-input"
              placeholder={t("admin.manage.placeholderSessionCount")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.form.sessionCount}
              onChangeText={(v) => crud.setForm({ sessionCount: v })}
            />
            <FieldError message={createFieldErrors.sessionCount} />
            <Input
              testID="package-validity-days-input"
              placeholder={t("admin.manage.placeholderValidityDays")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.form.validityDays}
              onChangeText={(v) => crud.setForm({ validityDays: v })}
            />
            <FieldError message={createFieldErrors.validityDays} />
            <Input
              testID="package-late-cancel-input"
              placeholder={t("admin.manage.placeholderLateCancel")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.form.lateCancelHours}
              onChangeText={(v) => crud.setForm({ lateCancelHours: v })}
            />
            <FieldError message={createFieldErrors.lateCancelHours} />
            <Input
              testID="package-price-input"
              placeholder={t("admin.manage.placeholderPrice")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.form.price}
              onChangeText={(v) => crud.setForm({ price: v })}
            />
            <FieldError
              message={
                !isPriceInputValid(crud.form.price)
                  ? t("admin.manage.priceInvalid")
                  : createFieldErrors.price
              }
            />
            <View className="flex-row items-center justify-between py-2">
              <Text className="text-foreground" style={{ fontSize: 15 }}>
                {t("admin.manage.isBirthdayGiftLabel")}
              </Text>
              <Switch
                testID="package-create-birthday-gift"
                value={crud.form.isBirthdayGift}
                onValueChange={(v) =>
                  crud.setForm({
                    isBirthdayGift: v,
                    ...(v ? { sessionCount: "1" } : null),
                  })
                }
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
            <Button
              testID="package-create-submit"
              disabled={
                crud.createMutation.isPending ||
                !crud.form.name ||
                !crud.form.sessionCount ||
                !crud.form.validityDays ||
                !crud.form.classTypeId ||
                !isPriceInputValid(crud.form.price) ||
                (crud.form.isBirthdayGift && crud.form.sessionCount !== "1")
              }
              onPress={() =>
                crud.submitCreate({
                  name: crud.form.name,
                  sessionCount: parseInt(crud.form.sessionCount, 10),
                  validityDays: parseInt(crud.form.validityDays, 10),
                  lateCancelHours: parseInt(crud.form.lateCancelHours, 10) || 8,
                  price: parsePriceInput(crud.form.price),
                  classTypeId: crud.form.classTypeId,
                  isBirthdayGift: crud.form.isBirthdayGift,
                })
              }
            >
              {t("admin.manage.create")}
            </Button>
            {crud.createMutation.isError && Object.keys(createFieldErrors).length === 0 ? (
              <ErrorState
                message={
                  (crud.createMutation.error as Error)?.message ??
                  t("admin.manage.createPackageError")
                }
              />
            ) : null}
          </View>
        </AppSheet>

        {/* ═══════════════════════════════════════════════════════════════════
            EDIT PACKAGE TYPE SHEET
        ═══════════════════════════════════════════════════════════════════ */}
        <AppSheet open={!!crud.editingId} onOpenChange={crud.onEditOpenChange} stackBehavior="push">
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
            >
              {t("admin.manage.sheetEditPackage")}
            </Text>
            <Input
              testID="package-edit-name-input"
              placeholder={t("admin.manage.placeholderName")}
              value={crud.editForm.name}
              onChangeText={(v) => crud.setEditForm({ name: v })}
            />
            <FieldError message={editFieldErrors.name} />
            <Select
              testID="package-edit-class-type-select"
              optionTestIDPrefix="package-edit-class-type-option"
              placeholder={t("admin.packages.classType")}
              value={crud.editForm.classTypeId}
              onChange={(v) => crud.setEditForm({ classTypeId: v })}
              emptyText={t("admin.schedule.emptyClassTypes")}
              options={(classTypesQuery.data?.classTypes ?? []).map((ct) => ({
                value: ct.id,
                label: ct.name,
              }))}
            />
            <FieldError message={editFieldErrors.classTypeId} />
            <Input
              testID="package-edit-session-count-input"
              placeholder={t("admin.manage.placeholderSessionCount")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.editForm.sessionCount}
              onChangeText={(v) => crud.setEditForm({ sessionCount: v })}
            />
            <FieldError message={editFieldErrors.sessionCount} />
            <Input
              testID="package-edit-validity-days-input"
              placeholder={t("admin.manage.placeholderValidityDays")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.editForm.validityDays}
              onChangeText={(v) => crud.setEditForm({ validityDays: v })}
            />
            <FieldError message={editFieldErrors.validityDays} />
            <Input
              testID="package-edit-late-cancel-input"
              placeholder={t("admin.manage.placeholderLateCancel")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.editForm.lateCancelHours}
              onChangeText={(v) => crud.setEditForm({ lateCancelHours: v })}
            />
            <FieldError message={editFieldErrors.lateCancelHours} />
            <Input
              testID="package-edit-price-input"
              placeholder={t("admin.manage.placeholderPrice")}
              keyboardType="numeric"
              inputMode="numeric"
              value={crud.editForm.price}
              onChangeText={(v) => crud.setEditForm({ price: v })}
            />
            <FieldError
              message={
                !isPriceInputValid(crud.editForm.price)
                  ? t("admin.manage.priceInvalid")
                  : editFieldErrors.price
              }
            />
            <View className="flex-row items-center justify-between py-2">
              <Text className="text-foreground" style={{ fontSize: 15 }}>
                {t("admin.manage.isBirthdayGiftLabel")}
              </Text>
              <Switch
                testID="package-edit-birthday-gift"
                value={crud.editForm.isBirthdayGift}
                onValueChange={(v) =>
                  crud.setEditForm({
                    isBirthdayGift: v,
                    ...(v ? { sessionCount: "1" } : null),
                  })
                }
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
            <Button
              testID="package-edit-save-button"
              disabled={
                crud.updateMutation.isPending ||
                !crud.editForm.name ||
                !crud.editForm.sessionCount ||
                !crud.editForm.validityDays ||
                !crud.editForm.classTypeId ||
                !isPriceInputValid(crud.editForm.price) ||
                (crud.editForm.isBirthdayGift && crud.editForm.sessionCount !== "1")
              }
              onPress={() => {
                if (!crud.editingId) return;
                crud.submitUpdate({
                  id: crud.editingId,
                  name: crud.editForm.name,
                  sessionCount: parseInt(crud.editForm.sessionCount, 10),
                  validityDays: parseInt(crud.editForm.validityDays, 10),
                  lateCancelHours: parseInt(crud.editForm.lateCancelHours, 10) || 8,
                  price: parsePriceInput(crud.editForm.price),
                  classTypeId: crud.editForm.classTypeId,
                  isBirthdayGift: crud.editForm.isBirthdayGift,
                });
              }}
            >
              {t("admin.schedule.saveChanges")}
            </Button>
            <Button
              testID="package-edit-delete-button"
              variant="danger"
              disabled={crud.removeMutation.isPending || !crud.editingId}
              onPress={crud.askDelete}
            >
              {t("admin.manage.deletePackage")}
            </Button>
            {crud.updateMutation.isError && Object.keys(editFieldErrors).length === 0 ? (
              <ErrorState
                message={
                  (crud.updateMutation.error as Error)?.message ??
                  t("admin.manage.createPackageError")
                }
              />
            ) : null}
          </View>
        </AppSheet>
        <ConfirmSheet
          stackBehavior="push"
          testID="package-delete-confirm-button"
          open={crud.confirmDelete}
          onOpenChange={crud.onDeleteOpenChange}
          title={t("confirm.deletePackageTitle")}
          message={t("confirm.deletePackageMessage")}
          confirmLabel={t("confirm.deletePackageConfirm")}
          loading={crud.removeMutation.isPending}
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
      </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
