// Migration note: the assignments list is rendered through `<PaginatedList>`
// and the search input + filter chips live in the existing fixed View ABOVE
// the list so they stay pinned while rows scroll underneath. The hand-rolled
// `ScrollView + onScroll → fetchNextPage` plumbing, the ActivityIndicator
// footer, and the skeleton/empty/error fallbacks are gone — the wrapper owns
// all of them.

import React, { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { MotiView } from "@/components/ui/styled";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { FilterChip } from "@/components/ui/studio";
import { PaginatedList } from "@/components/ui/paginated-list";
import { AssignPackageFlow } from "@/components/admin/assign-package-flow";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { now } from "@/lib/now";

type AssignmentFilter = "all" | "expiring" | "expired";

const FILTERS: { key: AssignmentFilter; labelKey: string }[] = [
  { key: "all", labelKey: "admin.manage.filterAll" },
  { key: "expiring", labelKey: "admin.manage.filterExpiring" },
  { key: "expired", labelKey: "admin.manage.filterExpired" },
];

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

export function ActiveAssignments() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding();
  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [search, setSearch] = useState("");
  const [showAssignFlow, setShowAssignFlow] = useState(false);

  // Debounced so typing fires one server query after the pause, not one per
  // letter — same pattern as the ClientPickerStep in assign-package-flow.
  const deferredSearch = useDebouncedValue(search.trim());
  const query = useInfiniteQuery(
    packagesQueries.clientPackagesAdminList({
      search: deferredSearch || undefined,
    }),
  );

  // Filter chips (all/expiring/expired) narrow client-side over the loaded
  // pages — same trade-off as Klijenti and Naplata. Pushing `filter` to the
  // server would require extending the API; most admins toggle chips across
  // the current view rather than asking for "ALL expired" globally.
  const loadedPackages = useMemo(
    () => query.data?.pages.flatMap((p) => p.packages) ?? [],
    [query.data],
  );
  const filtered = useMemo(() => {
    const today = now();
    if (filter === "expiring") {
      return loadedPackages.filter((p) => {
        const expiresAt = new Date(p.expiresAt);
        return expiresAt > today && expiresAt.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000;
      });
    }
    if (filter === "expired") {
      return loadedPackages.filter((p) => new Date(p.expiresAt) <= today);
    }
    return loadedPackages;
  }, [loadedPackages, filter]);

  type Pkg = (typeof loadedPackages)[number];

  return (
    <ScreenContainerRaw
      title={t("admin.manage.activeAssignments")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowAssignFlow(true)}
          testID="active-assignments-new-button"
          accessibilityLabel={t("admin.izvestaji.paketi.newAssignment")}
        />
      }
    >
      <View style={{ flex: 1 }}>
        {/* ── Sticky header ──────────────────────────────────────────────────
            Lives OUTSIDE the list so the search input and filter chips stay
            pinned while rows scroll underneath. The MotiView entry animations
            are preserved — they only run once on mount, not on every list
            scroll. */}
        <View
          style={{
            paddingTop: 16,
            paddingHorizontal: 24,
            paddingBottom: 16,
            gap: 16,
          }}
        >
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300 }}
          >
            <Input
              testID="active-assignments-search-input"
              placeholder={t("admin.manage.searchAssignmentsPlaceholder")}
              value={search}
              onChangeText={setSearch}
            />
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: -4 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 80 }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {FILTERS.map(({ key, labelKey }) => (
                <FilterChip
                  key={key}
                  active={filter === key}
                  label={t(labelKey)}
                  onPress={() => setFilter(key)}
                />
              ))}
            </ScrollView>
          </MotiView>
        </View>

        {/* ── List body ─────────────────────────────────────────────────────
            Filter chips narrow client-side over already-loaded pages
            (documented above). The wrapper owns loading / empty / error /
            fetch-next-page footer states. */}
        <PaginatedList<Pkg>
          query={query}
          data={filtered}
          keyExtractor={(pkg) => pkg.id}
          renderItem={({ item: pkg }) => {
            const expiresAt = new Date(pkg.expiresAt);
            const today = now();
            const isExpired = expiresAt <= today;
            const isExpiring =
              !isExpired &&
              expiresAt.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000;
            const packageName = pkg.packageType?.name ?? pkg.packageTypeId;
            const clientName = pkg.client?.fullName ?? "—";
            return (
              <View style={{ paddingBottom: 10 }}>
                <GlassCard size="md" testID={`active-assignment-row-${pkg.id}`}>
                  <View className="flex-row items-center gap-3">
                    <AssignmentAvatar name={clientName} />
                    <View className="flex-1 flex-col gap-0.5">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 15 }}
                        numberOfLines={1}
                      >
                        {clientName}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 13 }} numberOfLines={1}>
                        {packageName}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {t("admin.manage.sessionsRemaining", {
                          count: pkg.sessionsRemaining,
                        })}{" "}
                        ·{" "}
                        {t("admin.manage.expiresOn", {
                          date: dayjs(pkg.expiresAt).locale(lang).format("MMM D, YYYY"),
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
              </View>
            );
          }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: bottomPad,
          }}
          errorState={<ErrorState message={t("admin.manage.assignmentsError")} />}
          emptyState={<EmptyState title={t("admin.manage.assignmentsEmpty")} />}
        />
      </View>
      <AssignPackageFlow open={showAssignFlow} onOpenChange={setShowAssignFlow} />
    </ScreenContainerRaw>
  );
}
