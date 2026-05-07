import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { MotiView } from "@/components/ui/styled";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { FilterChip } from "@/components/ui/studio";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
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

export default function AdminActiveAssignments() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding();
  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [search, setSearch] = useState("");

  const query = useQuery(
    packagesQueries.clientPackagesAdminList({ search: search.trim() || undefined }),
  );

  const filtered = useMemo(() => {
    const list = query.data?.packages ?? [];
    const today = now();
    if (filter === "expiring") {
      return list.filter((p) => {
        const expiresAt = new Date(p.expiresAt);
        return expiresAt > today && expiresAt.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000;
      });
    }
    if (filter === "expired") {
      return list.filter((p) => new Date(p.expiresAt) <= today);
    }
    return list;
  }, [query.data?.packages, filter]);

  return (
    <ScreenContainerRaw title={t("admin.manage.activeAssignments")}>
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

        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 160 }}
          style={{ gap: 10 }}
        >
          {query.isError ? (
            <ErrorState message={t("admin.manage.assignmentsError")} />
          ) : null}

          {query.isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : null}

          {!query.isLoading && filtered.length === 0 ? (
            <EmptyState title={t("admin.manage.assignmentsEmpty")} />
          ) : null}

          {filtered.map((pkg) => {
            const expiresAt = new Date(pkg.expiresAt);
            const today = now();
            const isExpired = expiresAt <= today;
            const isExpiring =
              !isExpired &&
              expiresAt.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000;
            const packageName = pkg.packageType?.name ?? pkg.packageTypeId;
            const clientName = pkg.client?.fullName ?? "—";
            return (
              <GlassCard
                key={pkg.id}
                size="md"
                testID={`active-assignment-row-${pkg.id}`}
              >
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
            );
          })}
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
