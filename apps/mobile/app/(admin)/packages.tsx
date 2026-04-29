// P2-T10: Admin packages — grouped sections (package types + active assignments) with
// GlassCard rows, FilterChip bar, avatar-style session-count icon, MotiView stagger,
// and create-package AppSheet preserved verbatim.

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionLabel } from "@/components/ui/typography";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${
        active ? "bg-accent border-accent" : "bg-glass border-glass-border"
      }`}
    >
      <Text
        className={`text-xs font-body-semibold ${active ? "text-white" : "text-muted"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── SessionCountIcon ─────────────────────────────────────────────────────────
// Circular badge used on package-type rows to display session count.

function SessionCountIcon({ count }: { count: number }) {
  return (
    <View
      className="items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(46,91,66,0.25)",
        borderWidth: 1,
        borderColor: "rgba(46,91,66,0.45)",
      }}
    >
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
    <View
      className="items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(46,91,66,0.35)",
      }}
    >
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [form, setForm] = useState({
    name: "",
    sessionCount: "",
    validityDays: "",
    lateCancelHours: "12",
  });

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["packages", "types"] }),
      queryClient.invalidateQueries({ queryKey: ["packages", "client-packages"] }),
    ]);
    setRefreshing(false);
  }

  const typesQuery = useQuery(packagesQueries.types());
  const clientPackagesQuery = useQuery(packagesQueries.clientPackages());
  const allAssignments = clientPackagesQuery.data?.packages ?? [];

  const filteredAssignments = useMemo(() => {
    const now = dayjs();
    if (assignmentFilter === "expiring") {
      return allAssignments.filter((p) => {
        const exp = dayjs(p.expiresAt);
        return exp.isAfter(now) && exp.diff(now, "day") <= 7;
      });
    }
    if (assignmentFilter === "expired") {
      return allAssignments.filter((p) => dayjs(p.expiresAt).isBefore(now));
    }
    return allAssignments;
  }, [allAssignments, assignmentFilter]);

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

  const FILTERS: { key: AssignmentFilter; labelKey: string }[] = [
    { key: "all", labelKey: "admin.manage.filterAll" },
    { key: "expiring", labelKey: "admin.manage.filterExpiring" },
    { key: "expired", labelKey: "admin.manage.filterExpired" },
  ];

  return (
    <ScreenContainerRaw
      title={t("tabs.packages")}
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("admin.manage.sheetNewPackage")}
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
            tintColor="#2e5b42"
            colors={["#2e5b42"]}
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

          {!typesQuery.isError && (typesQuery.data?.packageTypes ?? []).length === 0 ? (
            <EmptyState title={t("admin.manage.packagesEmpty")} />
          ) : null}

          {(typesQuery.data?.packageTypes ?? []).map((pt) => (
            <GlassCard key={pt.id} size="md">
              <View className="flex-row items-center gap-3">
                <SessionCountIcon count={pt.sessionCount} />
                <View className="flex-1 flex-col gap-0.5">
                  <Text
                    className="text-foreground font-body-bold"
                    style={{ fontSize: 15 }}
                    numberOfLines={1}
                  >
                    {pt.name}
                  </Text>
                  <Text className="text-muted" style={{ fontSize: 13 }}>
                    {t("admin.manage.sessionsDays", {
                      count: pt.sessionCount,
                      days: pt.validityDays,
                    })}
                  </Text>
                  <Text className="text-muted" style={{ fontSize: 12 }}>
                    {t("admin.manage.lateCancel", { hours: pt.lateCancelHours })}
                  </Text>
                </View>
                <Badge status="neutral">
                  {`${pt.sessionCount}`}
                </Badge>
              </View>
            </GlassCard>
          ))}
        </MotiView>

        {/* ── Active assignments section ────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 160 }}
          style={{ gap: 10 }}
        >
          <SectionLabel>{t("admin.manage.activeAssignments")}</SectionLabel>

          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          >
            {FILTERS.map(({ key, labelKey }) => (
              <FilterChip
                key={key}
                active={assignmentFilter === key}
                label={t(labelKey)}
                onPress={() => setAssignmentFilter(key)}
              />
            ))}
          </ScrollView>
        </MotiView>

        {/* ── Assignment rows ───────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 240 }}
          style={{ gap: 10 }}
        >
          {clientPackagesQuery.isError ? (
            <ErrorState message={t("admin.manage.packagesError")} />
          ) : null}

          {filteredAssignments.length === 0 && !clientPackagesQuery.isLoading ? (
            <EmptyState title={t("admin.manage.packagesEmpty")} />
          ) : null}

          {filteredAssignments.map((pkg) => {
            const isExpired = dayjs(pkg.expiresAt).isBefore(dayjs());
            const isExpiring =
              !isExpired && dayjs(pkg.expiresAt).diff(dayjs(), "day") <= 7;
            const packageName = pkg.packageType?.name ?? pkg.packageTypeId;
            return (
              <GlassCard key={pkg.id} size="md">
                <View className="flex-row items-center gap-3">
                  <AssignmentAvatar name={packageName} />
                  <View className="flex-1 flex-col gap-0.5">
                    <Text
                      className="text-foreground font-body-semibold"
                      style={{ fontSize: 15 }}
                      numberOfLines={1}
                    >
                      {packageName}
                    </Text>
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {t("admin.manage.sessionsRemaining", {
                        count: pkg.sessionsRemaining,
                      })}
                    </Text>
                    <Text className="text-muted" style={{ fontSize: 12 }}>
                      {t("admin.manage.expiresOn", {
                        date: dayjs(pkg.expiresAt).format("MMM D, YYYY"),
                      })}
                    </Text>
                  </View>
                  <Badge
                    status={
                      isExpired ? "danger" : isExpiring ? "warning" : "success"
                    }
                  >
                    {isExpired
                      ? t("client.profileTab.expired")
                      : isExpiring
                        ? t("admin.manage.filterExpiring")
                        : t("client.package.active")}
                  </Badge>
                </View>
              </GlassCard>
            );
          })}
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
          </View>
        </AppSheet>
      </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
