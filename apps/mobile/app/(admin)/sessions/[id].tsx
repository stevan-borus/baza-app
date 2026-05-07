import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import Feather from "@expo/vector-icons/Feather";
import { GlassCard } from "@/components/ui/glass-card";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { useThemeTokens } from "@/components/ui/tokens";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

export default function AdminSessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();

  const query = useQuery(sessionsQueries.byId(String(id ?? "")));
  const session = query.data?.session;

  const headerTitle = session?.classType?.name ?? t("admin.sessionDetail.title");
  const dateLabel = session
    ? dayjs(session.startsAt).locale(lang).format("dddd, D. MMMM YYYY")
    : "";
  const timeLabel = session
    ? `${dayjs(session.startsAt).format("HH:mm")} – ${dayjs(session.endsAt).format("HH:mm")}`
    : "";
  const bookedCount = session?.bookings.length ?? 0;
  const capacity = session?.capacity ?? 0;

  return (
    <ScreenContainerRaw
      title={headerTitle}
      rightSlot={
        session ? (
          <HeaderIconButton
            icon="pencil"
            onPress={() =>
              router.push({
                pathname: "/(admin)",
                params: { editSessionId: session.id },
              })
            }
            accessibilityLabel={t("admin.sessionDetail.editAction")}
          />
        ) : undefined
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
        {query.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}

        {query.isError ? (
          <ErrorState message={t("admin.sessionDetail.loadError")} />
        ) : null}

        {session ? (
          <>
            <GlassCard size="md">
              <View style={{ gap: 8 }}>
                <Text className="text-foreground font-body-bold" style={{ fontSize: 18 }}>
                  {dateLabel}
                </Text>
                <Text className="text-muted" style={{ fontSize: 14 }}>
                  {timeLabel}
                </Text>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="user" size={13} color={tokens.muted} />
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {session.trainer?.fullName ?? "—"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="home" size={13} color={tokens.muted} />
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {session.room?.name ?? "—"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="users" size={13} color={tokens.muted} />
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {bookedCount}/{capacity}
                    </Text>
                  </View>
                </View>
              </View>
            </GlassCard>

            <View style={{ gap: 10 }}>
              <SectionLabel>{t("admin.sessionDetail.bookedClients")}</SectionLabel>
              {bookedCount === 0 ? (
                <EmptyState title={t("admin.sessionDetail.noBookings")} />
              ) : (
                session.bookings.map((b) => (
                  <Pressable
                    key={b.id}
                    testID={`session-detail-booking-${b.id}`}
                    onPress={() =>
                      router.push({
                        pathname: "/(admin)/clients",
                        params: { clientUserId: b.client.id },
                      })
                    }
                    android_ripple={null}
                  >
                    <GlassCard size="md">
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
                          <Text
                            className="text-accent font-body-bold"
                            style={{ fontSize: 13 }}
                          >
                            {b.client.fullName
                              .split(" ")
                              .map((w) => w[0] ?? "")
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            className="text-foreground font-body-semibold"
                            style={{ fontSize: 15 }}
                            numberOfLines={1}
                          >
                            {b.client.fullName}
                          </Text>
                          <Text
                            className="text-muted"
                            style={{ fontSize: 12 }}
                            numberOfLines={1}
                          >
                            {b.client.email}
                          </Text>
                        </View>
                        <Feather
                          name="chevron-right"
                          size={16}
                          color={tokens.muted}
                        />
                      </View>
                    </GlassCard>
                  </Pressable>
                ))
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
