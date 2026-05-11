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
import { ReturnToPill } from "@/components/admin/return-to-pill";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
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
import { SkeletonCard } from "@/components/ui/skeleton";
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
import { AvatarMenu } from "@/components/admin/avatar-menu";

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
  const [filterClientUserId, setFilterClientUserId] = useState<string>("");
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

  const monthFrom = selectedMonth.startOf("month").toISOString();
  const monthTo = selectedMonth.endOf("month").toISOString();
  const billingQuery = useInfiniteQuery(
    billingQueries.listInfinite({
      ...(filterClientUserId ? { clientUserId: filterClientUserId } : {}),
      from: monthFrom,
      to: monthTo,
    }),
  );
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

  // Filtered-totals subtitle (P4-2). "Filters active" here means the user
  // has narrowed the list below the default month view — i.e. picked a
  // specific client or a non-"all" status chip. The month chooser always
  // has a value, so we don't count from/to as "filters" for this UI cue.
  const filtersActive = filterClientUserId !== "" || activeFilter !== "all";
  const filteredCount = filteredRecords.length;
  const filteredAmount = useMemo(
    () => filteredRecords.reduce((sum, r) => sum + r.amount, 0),
    [filteredRecords],
  );

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
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <AvatarMenu />
          <HeaderIconButton
            icon="plus"
            onPress={() => setShowCreate(true)}
            accessibilityLabel={t("admin.manage.sheetNewPayment")}
          />
        </View>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          // Infinite scroll: when within 200px of the bottom, fetch next page.
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 200
          ) {
            handleEndReached();
          }
        }}
        scrollEventThrottle={400}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
      {/* Return-to pill — only when arriving from a cross-tab drill */}
      <ReturnToPill testID="naplata-return-to-pill" />

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
        {filtersActive ? (
          <Text
            testID="naplata-filtered-subtitle"
            className="text-muted font-body-medium mt-2"
            style={{ fontSize: 13 }}
          >
            {t("admin.manage.filteredSubtitle", {
              count: filteredCount,
              amount: filteredAmount.toLocaleString("sr-RS"),
            })}
          </Text>
        ) : null}
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

      {/* Per-client filter */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 240 }}
      >
        <Select
          testID="billing-filter-client-select"
          optionTestIDPrefix="billing-filter-client-option"
          placeholder={t("admin.manage.filterClientPlaceholder")}
          value={filterClientUserId}
          onChange={setFilterClientUserId}
          emptyText={t("admin.manage.filterClientEmpty")}
          options={[
            { value: "", label: t("admin.manage.filterAll") },
            ...(clientsQuery.data?.clients ?? []).map((c) => ({
              value: c.user.id,
              label: c.user.fullName ?? c.user.email,
            })),
          ]}
        />
      </MotiView>

      {/* Errors / empty / loading */}
      {billingQuery.isError ? (
        <ErrorState message={t("admin.manage.billingError")} />
      ) : null}
      {billingQuery.isLoading ? (
        <View style={{ gap: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}
      {filteredRecords.length === 0 && !billingQuery.isLoading && !billingQuery.isError ? (
        <EmptyState title={t("admin.manage.billingEmpty")} />
      ) : null}

      {/* Transaction list */}
      {filteredRecords.length > 0 ? (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
        >
          <View style={{ gap: 8 }}>
            {filteredRecords.map((item) => (
              <View key={item.id} className="px-1 py-1.5">
                <Card testID={`billing-row-${item.id}`}>
                  <View className="flex-col gap-2">
                    {/* Primary identity: client name leads the card so admins
                        can scan the list by WHO paid, not just amount/method. */}
                    {item.client?.fullName ? (
                      <Text
                        testID={`billing-row-client-${item.id}`}
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 15 }}
                        numberOfLines={1}
                      >
                        {item.client.fullName}
                      </Text>
                    ) : null}
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
            ))}
            {billingQuery.isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : null}
          </View>
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
              testID="billing-client-select"
              optionTestIDPrefix="billing-client-option"
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
              testID="billing-amount-input"
              placeholder={t("admin.manage.placeholderAmount")}
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(v) => setForm((s) => ({ ...s, amount: v }))}
            />
            <Select
              testID="billing-method-select"
              optionTestIDPrefix="billing-method-option"
              placeholder={t("admin.manage.paymentMethod")}
              value={form.method}
              onChange={(v) => setForm((s) => ({ ...s, method: v }))}
              options={methods.map((m) => ({
                value: m,
                label: t(methodLabelKeys[m]),
              }))}
            />
            <Select
              testID="billing-package-select"
              optionTestIDPrefix="billing-package-option"
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
              testID="billing-create-submit"
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
