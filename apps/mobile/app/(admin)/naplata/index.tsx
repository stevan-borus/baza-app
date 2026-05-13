/**
 * Design references (from docs/inspiration/):
 * - Stripe Dashboard ios Jun 2023/ — period selector, hero revenue, transaction list detail
 *
 * Migration note: the billing list is rendered through `<PaginatedList>` and
 * the period selector + hero + StatStrip + per-client filter live in a fixed
 * View ABOVE the list so they no longer drift off-screen as the user scrolls.
 *
 * PR β trim (2026-05-12): the status filter chip strip (Sve / Potvrđen /
 * Na čekanju / Otkazan) is gone — the studio doesn't run a payment-
 * confirmation workflow, so PENDING and CANCELED rows never existed in
 * practice and the chips for them just produced empty lists. List rows
 * also moved from GlassCard chrome to a hairline-row pattern that triples
 * on-screen density (matches Klijenti's row style).
 *
 * Hidden search input: a `testID="naplata-search-input"` Input is mounted
 * in the sticky header purely as the e2e anchor for the sticky-header spec.
 * It also serves as a natural client-side filter over the loaded pages
 * (matches client.fullName / notes), same trade-off documented in the
 * Klijenti and ActiveAssignments migrations.
 */
import { useState, useMemo, useEffect } from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import { ReturnToPill } from "@/components/admin/return-to-pill";
import { MotiView } from "@/components/ui/styled";
import { getDateLocale } from "@/lib/i18n";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/card";
import { NumberRollup } from "@/components/ui/number-rollup";
import { CapsLabel, StatStrip } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import Feather from "@expo/vector-icons/Feather";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PaginatedList } from "@/components/ui/paginated-list";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import {
  billingQueries,
  type BillingRecord,
} from "@/lib/queries/billing-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";

export default function AdminBilling() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs());
  const [searchQuery, setSearchQuery] = useState("");
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
      from: monthFrom,
      to: monthTo,
    }),
  );
  // Naplata uses clients in two places: the filter Select and the create-
  // payment Select. Both render every option upfront — pagination on the
  // server is still worth it (the API doesn't have to compute packageStatus
  // for 1000 clients) but here we eagerly drain pages so the dropdown shows
  // the full set. take=100 hits the server cap and keeps round-trips few.
  const clientsQuery = useInfiniteQuery(clientsQueries.list({ take: 100 }));
  useEffect(() => {
    if (clientsQuery.hasNextPage && !clientsQuery.isFetchingNextPage) {
      clientsQuery.fetchNextPage();
    }
  }, [clientsQuery.hasNextPage, clientsQuery.isFetchingNextPage, clientsQuery]);
  const allClients = useMemo(
    () => clientsQuery.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQuery.data],
  );
  const packageTypesQuery = useQuery(packagesQueries.types());
  const records = useMemo(
    () => billingQuery.data?.pages.flatMap((p) => p.records) ?? [],
    [billingQuery.data],
  );

  // Pre-pagination behavior preserved: StatStrip's totals sum the records
  // currently in memory, not a server-side aggregate over the whole month.
  // Today that's all-loaded-pages, which matches what it summed before the
  // listInfinite migration (the old non-paginated endpoint returned the same
  // set in one go). Worth tightening to a server aggregate later — out of
  // scope for this UI-migration PR.
  //
  // PR β note: BillingStatus is now a single-value enum (CONFIRMED), so the
  // status filter is a no-op kept here for clarity in case the enum ever
  // grows again. Today every record satisfies it.
  const summaryStats = useMemo(() => {
    const confirmed = records.filter((r) => r.status === "CONFIRMED");
    const totalRevenue = confirmed.reduce((sum, r) => sum + r.amount, 0);
    const count = confirmed.length;
    const uniqueClients = new Set(confirmed.map((r) => r.clientUserId)).size;
    const avg = uniqueClients > 0 ? Math.round(totalRevenue / uniqueClients) : 0;
    return { totalRevenue, count, avg };
  }, [records]);

  // Search input narrows client-side over already-loaded pages — same
  // trade-off as Klijenti and ActiveAssignments. The status filter chip
  // strip (PR β) is gone because the studio's workflow only ever produced
  // CONFIRMED rows in practice, so the chips for PENDING / CANCELED were
  // dead UX.
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let out: BillingRecord[] = records;
    if (q) {
      out = out.filter((r) => {
        const name = r.client?.fullName?.toLowerCase() ?? "";
        const notes = r.notes?.toLowerCase() ?? "";
        return name.includes(q) || notes.includes(q);
      });
    }
    return out;
  }, [records, searchQuery]);

  // Filtered-totals subtitle (P4-2). "Filters active" here means the user
  // has narrowed the list below the default month view by typing a search.
  // The month chooser always has a value, so we don't count from/to as a
  // "filter" for this UI cue.
  const filtersActive = searchQuery.trim() !== "";
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

  const methodLabelKeys: Record<string, string> = {
    CASH: "admin.manage.methodCash",
    CARD: "admin.manage.methodCard",
    COMPANY: "admin.manage.methodCompany",
    MANUAL_ONLINE: "admin.manage.methodOnline",
  };
  const methods = ["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"] as const;
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
      <View style={{ flex: 1 }}>
        {/* ── Sticky header ──────────────────────────────────────────────────
            Lives OUTSIDE the list so the period selector, hero revenue,
            StatStrip, search input, and per-client filter stay pinned
            while rows scroll underneath. The MotiView entry animations
            are preserved — they only run once on mount, not on every list
            scroll.

            PR β: paddingTop/Bottom tightened (16 → 8) on the period
            selector wrapper to bring the hero higher up the viewport. */}
        <View
          style={{
            paddingTop: 8,
            paddingHorizontal: 24,
            paddingBottom: 8,
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

          {/* Search input — pinned in the header (testID anchors the e2e
              sticky-header spec). The per-client filter dropdown was
              dropped — the search field already filters by client name /
              notes, so the dropdown was a redundant second affordance. */}
          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 180 }}
          >
            <Input
              testID="naplata-search-input"
              placeholder={t("admin.manage.searchPlaceholder")}
              leftIcon="search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MotiView>
        </View>

        {/* ── List body ─────────────────────────────────────────────────────
            Search input narrows client-side over already-loaded pages
            (documented above). The wrapper owns loading / empty / error /
            fetch-next-page footer states.

            PR β row shape: hairline list rows (~56-64px tall) instead of
            GlassCard chrome — same pattern as Klijenti. Two-line layout:
            client name + amount on the top row, method · date + status
            badge underneath. ItemSeparator is a 1px hairline indented
            20px from the left edge for editorial feel. */}
        <PaginatedList<BillingRecord>
          query={billingQuery}
          data={filteredRecords}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BillingRow
              item={item}
              t={t}
              dateLocale={dateLocale}
              methodLabelKeys={methodLabelKeys}
            />
          )}
          ItemSeparatorComponent={BillingRowSeparator}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: bottomPad,
          }}
          errorState={<ErrorState message={t("admin.manage.billingError")} />}
          emptyState={<EmptyState title={t("admin.manage.billingEmpty")} />}
        />
      </View>

      {/* Create payment sheet — preserved wholesale (now mounted as a sibling
          of the list, not inside the old ScrollView). */}
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
            options={allClients.map((c) => ({
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
            options={(packageTypesQuery.data?.packageTypes ?? []).map((pt) => ({
              value: pt.id,
              label: pt.name,
              hint: t("admin.manage.sessionsDays", {
                count: pt.sessionCount,
                days: pt.validityDays,
              }),
            }))}
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
    </ScreenContainerRaw>
  );
}

// ─── Row components ─────────────────────────────────────────────────────────
// PR β: hairline list row matching Klijenti's pattern. Two text rows + a
// status badge — drop the surrounding GlassCard so per-row height shrinks
// from ~140px to ~56-64px and the list shows 3x as many records per
// viewport.

function BillingRow({
  item,
  t,
  dateLocale,
  methodLabelKeys,
}: {
  item: BillingRecord;
  t: (key: string, opts?: Record<string, unknown>) => string;
  dateLocale: ReturnType<typeof getDateLocale>;
  methodLabelKeys: Record<string, string>;
}) {
  const methodLabel = methodLabelKeys[item.method]
    ? t(methodLabelKeys[item.method])
    : item.method;
  const dateLabel = new Date(item.createdAt).toLocaleDateString(dateLocale);
  return (
    <View
      testID={`billing-row-${item.id}`}
      className="flex-row items-center gap-3 py-3"
    >
      <View className="flex-1 gap-0.5">
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
        <Text
          className="text-muted"
          style={{ fontSize: 12 }}
          numberOfLines={1}
        >
          {methodLabel} · {dateLabel}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text
          className="text-foreground font-body-semibold"
          style={{ fontSize: 15 }}
          numberOfLines={1}
        >
          {item.amount.toLocaleString("sr-RS")} RSD
        </Text>
        <Badge status="success">{t("admin.manage.statusConfirmed")}</Badge>
      </View>
    </View>
  );
}

function BillingRowSeparator() {
  // Hairline divider flush with the row content. Klijenti uses a left
  // inset to clear the avatar; Naplata rows have no leading adornment, so
  // an indented hairline reads as a misalignment.
  return <View className="bg-glass-border" style={{ height: 1 }} />;
}
