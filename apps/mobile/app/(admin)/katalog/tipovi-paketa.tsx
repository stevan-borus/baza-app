// P2-T10: Admin packages — grouped sections (package types + active assignments) with
// GlassCard rows, FilterChip bar, avatar-style session-count icon, MotiView stagger,
// and create-package AppSheet preserved verbatim.

import React, { useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import Feather from "@expo/vector-icons/Feather";

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
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [form, setForm] = useState({
    name: "",
    sessionCount: "",
    validityDays: "",
    lateCancelHours: "8",
    classTypeId: "",
    isBirthdayGift: false,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    sessionCount: "",
    validityDays: "",
    lateCancelHours: "8",
    classTypeId: "",
    isBirthdayGift: false,
  });

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["packages", "types"] }),
      queryClient.invalidateQueries({ queryKey: ["packages", "client-packages"] }),
    ]);
    setRefreshing(false);
  }

  const router = useRouter();
  const typesQuery = useQuery(packagesQueries.types());
  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  const createMutation = useMutation({
    ...packagesQueries.createType(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages", "types"] });
      setShowCreate(false);
      setForm({
        name: "",
        sessionCount: "",
        validityDays: "",
        lateCancelHours: "8",
        classTypeId: "",
        isBirthdayGift: false,
      });
    },
  });

  const updateTypeMutation = useMutation({
    ...packagesQueries.updateType(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages", "types"] });
      setEditingId(null);
    },
  });

  const deleteTypeMutation = useMutation({
    ...packagesQueries.deleteType(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages", "types"] });
      setConfirmDelete(false);
      setEditingId(null);
    },
  });

  function openEdit(pt: {
    id: string;
    name: string;
    sessionCount: number;
    validityDays: number;
    lateCancelHours: number;
    classTypeId: string;
    isBirthdayGift?: boolean;
  }) {
    setEditForm({
      name: pt.name,
      sessionCount: String(pt.sessionCount),
      validityDays: String(pt.validityDays),
      lateCancelHours: String(pt.lateCancelHours),
      classTypeId: pt.classTypeId,
      isBirthdayGift: pt.isBirthdayGift ?? false,
    });
    setEditingId(pt.id);
  }

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
          onPress={() => setShowCreate(true)}
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
                    onPress={() => openEdit(pt)}
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
                      <Text
                        className="text-muted"
                        style={{ fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {pt.classType?.name ?? "—"}
                        {" · "}
                        {t("admin.manage.sessionsDays", {
                          count: pt.sessionCount,
                          days: pt.validityDays,
                        })}
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
                    <FontAwesome
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
                  <Feather name="users" size={16} color={tokens.accent} />
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
                <Feather name="chevron-right" size={18} color={tokens.muted} />
              </View>
            </GlassCard>
          </Pressable>
        </MotiView>

        {/* ═══════════════════════════════════════════════════════════════════
            CREATE PACKAGE TYPE SHEET — preserved verbatim
        ═══════════════════════════════════════════════════════════════════ */}
        <AppSheet open={showCreate} onOpenChange={setShowCreate}>
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
              value={form.name}
              onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
            />
            <Select
              testID="package-class-type-select"
              optionTestIDPrefix="package-class-type-option"
              placeholder={t("admin.packages.classType")}
              value={form.classTypeId}
              onChange={(v) => setForm((s) => ({ ...s, classTypeId: v }))}
              emptyText={t("admin.schedule.emptyClassTypes")}
              options={(classTypesQuery.data?.classTypes ?? []).map((ct) => ({
                value: ct.id,
                label: ct.name,
              }))}
            />
            <Input
              testID="package-session-count-input"
              placeholder={t("admin.manage.placeholderSessionCount")}
              keyboardType="numeric"
              value={form.sessionCount}
              onChangeText={(v) => setForm((s) => ({ ...s, sessionCount: v }))}
            />
            <Input
              testID="package-validity-days-input"
              placeholder={t("admin.manage.placeholderValidityDays")}
              keyboardType="numeric"
              value={form.validityDays}
              onChangeText={(v) => setForm((s) => ({ ...s, validityDays: v }))}
            />
            <Input
              testID="package-late-cancel-input"
              placeholder={t("admin.manage.placeholderLateCancel")}
              keyboardType="numeric"
              value={form.lateCancelHours}
              onChangeText={(v) =>
                setForm((s) => ({ ...s, lateCancelHours: v }))
              }
            />
            <View className="flex-row items-center justify-between py-2">
              <Text className="text-foreground" style={{ fontSize: 15 }}>
                {t("admin.manage.isBirthdayGiftLabel")}
              </Text>
              <Switch
                value={form.isBirthdayGift}
                onValueChange={(v) =>
                  setForm((s) => ({
                    ...s,
                    isBirthdayGift: v,
                    sessionCount: v ? "1" : s.sessionCount,
                  }))
                }
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
            <Button
              testID="package-create-submit"
              disabled={
                createMutation.isPending ||
                !form.name ||
                !form.sessionCount ||
                !form.validityDays ||
                !form.classTypeId
              }
              onPress={() =>
                createMutation.mutate({
                  name: form.name,
                  sessionCount: parseInt(form.sessionCount, 10),
                  validityDays: parseInt(form.validityDays, 10),
                  lateCancelHours: parseInt(form.lateCancelHours, 10) || 8,
                  classTypeId: form.classTypeId,
                  isBirthdayGift: form.isBirthdayGift,
                })
              }
            >
              {t("admin.manage.create")}
            </Button>
            {createMutation.isError ? (
              <ErrorState message={t("admin.manage.createPackageError")} />
            ) : null}
          </View>
        </AppSheet>

        {/* ═══════════════════════════════════════════════════════════════════
            EDIT PACKAGE TYPE SHEET
        ═══════════════════════════════════════════════════════════════════ */}
        <AppSheet open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
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
              value={editForm.name}
              onChangeText={(v) => setEditForm((s) => ({ ...s, name: v }))}
            />
            <Select
              testID="package-edit-class-type-select"
              optionTestIDPrefix="package-edit-class-type-option"
              placeholder={t("admin.packages.classType")}
              value={editForm.classTypeId}
              onChange={(v) =>
                setEditForm((s) => ({ ...s, classTypeId: v }))
              }
              emptyText={t("admin.schedule.emptyClassTypes")}
              options={(classTypesQuery.data?.classTypes ?? []).map((ct) => ({
                value: ct.id,
                label: ct.name,
              }))}
            />
            <Input
              testID="package-edit-session-count-input"
              placeholder={t("admin.manage.placeholderSessionCount")}
              keyboardType="numeric"
              value={editForm.sessionCount}
              onChangeText={(v) =>
                setEditForm((s) => ({ ...s, sessionCount: v }))
              }
            />
            <Input
              testID="package-edit-validity-days-input"
              placeholder={t("admin.manage.placeholderValidityDays")}
              keyboardType="numeric"
              value={editForm.validityDays}
              onChangeText={(v) =>
                setEditForm((s) => ({ ...s, validityDays: v }))
              }
            />
            <Input
              testID="package-edit-late-cancel-input"
              placeholder={t("admin.manage.placeholderLateCancel")}
              keyboardType="numeric"
              value={editForm.lateCancelHours}
              onChangeText={(v) =>
                setEditForm((s) => ({ ...s, lateCancelHours: v }))
              }
            />
            <View className="flex-row items-center justify-between py-2">
              <Text className="text-foreground" style={{ fontSize: 15 }}>
                {t("admin.manage.isBirthdayGiftLabel")}
              </Text>
              <Switch
                value={editForm.isBirthdayGift}
                onValueChange={(v) =>
                  setEditForm((s) => ({
                    ...s,
                    isBirthdayGift: v,
                    sessionCount: v ? "1" : s.sessionCount,
                  }))
                }
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
            <Button
              testID="package-edit-save-button"
              disabled={
                updateTypeMutation.isPending ||
                !editForm.name ||
                !editForm.sessionCount ||
                !editForm.validityDays ||
                !editForm.classTypeId
              }
              onPress={() => {
                if (!editingId) return;
                updateTypeMutation.mutate({
                  id: editingId,
                  name: editForm.name,
                  sessionCount: parseInt(editForm.sessionCount, 10),
                  validityDays: parseInt(editForm.validityDays, 10),
                  lateCancelHours: parseInt(editForm.lateCancelHours, 10) || 8,
                  classTypeId: editForm.classTypeId,
                  isBirthdayGift: editForm.isBirthdayGift,
                });
              }}
            >
              {t("admin.schedule.saveChanges")}
            </Button>
            <Button
              testID="package-edit-delete-button"
              variant="danger"
              disabled={deleteTypeMutation.isPending || !editingId}
              onPress={() => setConfirmDelete(true)}
            >
              {t("admin.manage.deletePackage")}
            </Button>
            {updateTypeMutation.isError ? (
              <ErrorState
                message={
                  (updateTypeMutation.error as Error)?.message ??
                  t("admin.manage.createPackageError")
                }
              />
            ) : null}
          </View>
        </AppSheet>
        <ConfirmSheet
          testID="package-delete-confirm-button"
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("confirm.deletePackageTitle")}
          message={t("confirm.deletePackageMessage")}
          confirmLabel={t("confirm.deletePackageConfirm")}
          loading={deleteTypeMutation.isPending}
          errorMessage={
            deleteTypeMutation.isError
              ? (deleteTypeMutation.error as Error)?.message ?? null
              : null
          }
          onConfirm={() => {
            if (!editingId) return;
            deleteTypeMutation.mutate(editingId);
          }}
        />
      </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
