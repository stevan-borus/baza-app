/**
 * Design references (from docs/inspiration/):
 * - Stripe Dashboard ios Jun 2023/ — period selector, hero revenue, transaction list detail
 */
import { useState, useMemo } from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { LegendList } from "@legendapp/list";
import { getDateLocale } from "@/lib/i18n";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { NumberRollup } from "@/components/ui/number-rollup";
import { SectionLabel } from "@/components/ui/typography";
import { CapsLabel, FilterChip, StatStrip } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import Feather from "@expo/vector-icons/Feather";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import {
  billingQueries,
  type BillingRecord,
} from "@/lib/queries/billing-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";

type FilterTab = "all" | "confirmed" | "canceled" | "pending";

export default function AdminBilling() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs());
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: t("admin.manage.filterAll") },
    { value: "confirmed", label: t("admin.manage.statusConfirmed") },
    { value: "pending", label: t("admin.manage.statusPending") },
    { value: "canceled", label: t("admin.manage.statusCanceled") },
  ];
  const [form, setForm] = useState({
    clientUserId: "",
    amount: "",
    method: "CASH",
    notes: "",
    packageTypeId: "",
  });

  const billingQuery = useInfiniteQuery(billingQueries.listInfinite());
  const clientsQuery = useQuery(clientsQueries.list());
  const packageTypesQuery = useQuery(packagesQueries.types());
  const records = billingQuery.data?.pages.flatMap((p) => p.records) ?? [];

  const summaryStats = useMemo(() => {
    const confirmed = records.filter((r) => r.status === "CONFIRMED");
    const totalRevenue = confirmed.reduce((sum, r) => sum + r.amount, 0);
    const count = confirmed.length;
    const uniqueClients = new Set(confirmed.map((r) => r.clientUserId)).size;
    const avg = uniqueClients > 0 ? Math.round(totalRevenue / uniqueClients) : 0;
    return { totalRevenue, count, avg };
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (activeFilter === "all") return records;
    if (activeFilter === "confirmed")
      return records.filter((r) => r.status === "CONFIRMED");
    if (activeFilter === "pending")
      return records.filter((r) => r.status === "PENDING");
    if (activeFilter === "canceled")
      return records.filter((r) => r.status === "CANCELED");
    return records;
  }, [records, activeFilter]);

  function navigateBillingMonth(direction: -1 | 1) {
    setSelectedMonth((m) => m.add(direction, "month"));
  }

  const createMutation = useMutation({
    ...billingQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      setShowCreate(false);
      setForm({
        clientUserId: "",
        amount: "",
        method: "CASH",
        notes: "",
        packageTypeId: "",
      });
    },
  });

  function handleEndReached() {
    if (billingQuery.hasNextPage && !billingQuery.isFetchingNextPage)
      billingQuery.fetchNextPage();
  }

  const methodLabelKeys: Record<string, string> = {
    CASH: "admin.manage.methodCash",
    CARD: "admin.manage.methodCard",
    COMPANY: "admin.manage.methodCompany",
    QR: "admin.manage.methodQr",
    MANUAL_ONLINE: "admin.manage.methodOnline",
  };
  const statusLabelKeys: Record<string, string> = {
    PENDING: "admin.manage.statusPending",
    CONFIRMED: "admin.manage.statusConfirmed",
    CANCELED: "admin.manage.statusCanceled",
  };
  const methods = ["CASH", "CARD", "COMPANY", "QR", "MANUAL_ONLINE"] as const;
  const dateLocale = getDateLocale();

  const periodLabel = selectedMonth.locale(lang).format("MMMM YYYY");

  return (
    <ScreenContainerRaw
      title={t("tabs.billing")}
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("admin.manage.sheetNewPayment")}
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
      {/* Period selector — caps label between Feather chevrons */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 0 }}
      >
        <View className="flex-row justify-between items-center">
          <Pressable
            onPress={() => navigateBillingMonth(-1)}
            hitSlop={12}
            android_ripple={null}
            className="active:opacity-60 w-9 h-9 items-center justify-center"
          >
            <Feather name="chevron-left" size={20} color={tokens.foreground} />
          </Pressable>
          <CapsLabel size={11} tracking={1.6}>
            {periodLabel}
          </CapsLabel>
          <Pressable
            onPress={() => navigateBillingMonth(1)}
            hitSlop={12}
            android_ripple={null}
            className="active:opacity-60 w-9 h-9 items-center justify-center"
          >
            <Feather name="chevron-right" size={20} color={tokens.foreground} />
          </Pressable>
        </View>
      </MotiView>

      {/* Total revenue — editorial overline + giant numeral */}
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 80 }}
      >
        <View className="gap-1.5">
          <CapsLabel size={11} tracking={1.6} className="text-muted">
            {t("admin.manage.totalRevenue")}
          </CapsLabel>
          <View className="flex-row items-baseline">
            <NumberRollup
              value={summaryStats.totalRevenue}
              formatter={(n) =>
                `${Math.round(n).toLocaleString("sr-RS")}`
              }
              className="text-foreground font-body-bold"
              style={{ fontSize: 40, letterSpacing: -1, lineHeight: 44 }}
            />
            <Text
              className="text-muted ml-2"
              style={{ fontFamily: "AlbertSans-Medium", fontSize: 14 }}
            >
              RSD
            </Text>
          </View>
        </View>
      </MotiView>

      {/* Stat strip — count + average */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 140 }}
      >
        <StatStrip
          className=""
          items={[
            {
              label: t("admin.manage.transactionCount"),
              value: summaryStats.count,
            },
            {
              label: t("admin.manage.avgPerClient"),
              value: summaryStats.avg
                ? `${Math.round(summaryStats.avg).toLocaleString("sr-RS")}`
                : undefined,
              accent: true,
            },
          ]}
        />
      </MotiView>

      {/* Filter chips */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 200 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {filterTabs.map((tab) => (
            <FilterChip
              key={tab.value}
              label={tab.label}
              active={activeFilter === tab.value}
              onPress={() => setActiveFilter(tab.value)}
            />
          ))}
        </ScrollView>
      </MotiView>

      {/* Errors / empty */}
      {billingQuery.isError ? (
        <ErrorState message={t("admin.manage.billingError")} />
      ) : null}
      {filteredRecords.length === 0 && !billingQuery.isLoading ? (
        <EmptyState title={t("admin.manage.billingEmpty")} />
      ) : null}

      {/* Transaction list */}
      {filteredRecords.length > 0 ? (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
          style={{ height: 400 }}
        >
          <LegendList
            data={filteredRecords}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: BillingRecord }) => (
              <View className="px-1 py-1.5">
                <Card testID={`billing-row-${item.id}`}>
                  <View className="flex-col gap-2">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-foreground font-extrabold" style={{ fontSize: 20 }}>
                        {item.amount} RSD
                      </Text>
                      <Badge
                        status={
                          item.status === "CONFIRMED"
                            ? "success"
                            : item.status === "PENDING"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {statusLabelKeys[item.status]
                          ? t(statusLabelKeys[item.status])
                          : item.status}
                      </Badge>
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-muted" style={{ fontSize: 13 }}>
                        {methodLabelKeys[item.method]
                          ? t(methodLabelKeys[item.method])
                          : item.method}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleDateString(
                          dateLocale,
                        )}
                      </Text>
                    </View>
                    {item.notes ? (
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              </View>
            )}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              billingQuery.isFetchingNextPage ? (
                <ActivityIndicator style={{ padding: 16 }} />
              ) : null
            }
          />
        </MotiView>
      ) : null}

      {/* Create payment sheet — preserved wholesale */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
            >
              {t("admin.manage.sheetNewPayment")}
            </Text>
            <Select
              placeholder={t("admin.manage.client")}
              value={form.clientUserId}
              onChange={(v) => setForm((s) => ({ ...s, clientUserId: v }))}
              emptyText={t("admin.manage.emptyClients")}
              options={(clientsQuery.data?.clients ?? []).map((c) => ({
                value: c.user.id,
                label: c.user.fullName,
                hint: c.user.email,
              }))}
            />
            <Input
              placeholder={t("admin.manage.placeholderAmount")}
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(v) => setForm((s) => ({ ...s, amount: v }))}
            />
            <Select
              placeholder={t("admin.manage.paymentMethod")}
              value={form.method}
              onChange={(v) => setForm((s) => ({ ...s, method: v }))}
              options={methods.map((m) => ({
                value: m,
                label: t(methodLabelKeys[m]),
              }))}
            />
            <Select
              placeholder={t("admin.manage.packageOptional")}
              value={form.packageTypeId}
              onChange={(v) =>
                setForm((s) => ({
                  ...s,
                  packageTypeId: form.packageTypeId === v ? "" : v,
                }))
              }
              emptyText={t("admin.manage.packagesEmpty")}
              options={(packageTypesQuery.data?.packageTypes ?? []).map(
                (pt) => ({
                  value: pt.id,
                  label: pt.name,
                  hint: t("admin.manage.sessionsDays", {
                    count: pt.sessionCount,
                    days: pt.validityDays,
                  }),
                }),
              )}
            />
            <Input
              placeholder={t("admin.manage.placeholderNotes")}
              value={form.notes}
              onChangeText={(v) => setForm((s) => ({ ...s, notes: v }))}
            />
            <Button
              disabled={
                createMutation.isPending || !form.clientUserId || !form.amount
              }
              onPress={() =>
                createMutation.mutate({
                  clientUserId: form.clientUserId,
                  amount: parseInt(form.amount, 10),
                  method: form.method,
                  status: "CONFIRMED",
                  notes: form.notes || undefined,
                  packageTypeId: form.packageTypeId || undefined,
                  activatePackageOnConfirm: !!form.packageTypeId,
                })
              }
            >
              {t("admin.manage.create")}
            </Button>
            {createMutation.isError ? (
              <ErrorState message={t("admin.manage.createPaymentError")} />
            ) : null}
        </View>
      </AppSheet>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
