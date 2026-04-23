import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { ActionButton } from "@/components/ui/action-button";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/typography";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";

type AssignmentFilter = "all" | "expiring" | "expired";

export default function AdminPackages() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 12,
        paddingHorizontal: 24,
        paddingBottom: TAB_BAR_HEIGHT + 16,
        gap: 16,
      }}
    >
      <SectionHeader title={t("admin.manage.packageTypes")} />
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
          <View className="flex-col gap-1">
            <Text className="text-foreground font-semibold" style={{ fontSize: 15 }}>
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
        </Card>
      ))}

      <SectionHeader title={t("admin.manage.activeAssignments")} />
      <View className="flex-row flex-wrap gap-2">
        {(["all", "expiring", "expired"] as const).map((f) => (
          <Button
            key={f}
            size="small"
            variant={assignmentFilter === f ? "primary" : "secondary"}
            onPress={() => setAssignmentFilter(f)}
          >
            {t(`admin.manage.filter${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
          </Button>
        ))}
      </View>
      {clientPackagesQuery.isError ? (
        <ErrorState message={t("admin.manage.packagesError")} />
      ) : null}
      {filteredAssignments.length === 0 && !clientPackagesQuery.isLoading ? (
        <EmptyState title={t("admin.manage.packagesEmpty")} />
      ) : null}
      {filteredAssignments.map((pkg) => {
        const isExpired = dayjs(pkg.expiresAt).isBefore(dayjs());
        const isExpiring = !isExpired && dayjs(pkg.expiresAt).diff(dayjs(), "day") <= 7;
        return (
          <Card key={pkg.id}>
            <View className="flex-col gap-1.5">
              <View className="flex-row justify-between items-center">
                <Text className="text-foreground font-semibold" style={{ fontSize: 15 }}>
                  {pkg.packageType?.name ?? pkg.packageTypeId}
                </Text>
                <Badge status={isExpired ? "danger" : isExpiring ? "warning" : "success"}>
                  {isExpired ? t("client.profileTab.expired") : isExpiring ? t("admin.manage.filterExpiring") : t("client.package.active")}
                </Badge>
              </View>
              <Text className="text-muted" style={{ fontSize: 13 }}>
                {t("admin.manage.sessionsRemaining", { count: pkg.sessionsRemaining })}
              </Text>
              <Text className="text-muted" style={{ fontSize: 12 }}>
                {t("admin.manage.expiresOn", { date: dayjs(pkg.expiresAt).format("MMM D, YYYY") })}
              </Text>
            </View>
          </Card>
        );
      })}

      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-bold"
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
    </ScrollView>
  );
}
