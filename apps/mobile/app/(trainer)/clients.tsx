/**
 * Trainer Clients screen — sessions grouped by date with client rows underneath.
 * Layout: HeroCard (today stats) → sticky-like date sections → session subheaders → GlassCard client rows.
 * Motion: MotiView stagger on header+hero (0/80ms) and a single list wrapper (160ms).
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroCard } from "@/components/ui/hero-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function groupSessionsByDate(
  sessions: Array<{ id: string; startsAt: string; [key: string]: unknown }>,
  dateLocale: string,
): Array<{ dateLabel: string; sessions: typeof sessions }> {
  const map = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const label = new Date(s.startsAt).toLocaleDateString(dateLocale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const group = map.get(label) ?? [];
    group.push(s);
    map.set(label, group);
  }
  return Array.from(map.entries()).map(([dateLabel, sessions]) => ({
    dateLabel,
    sessions,
  }));
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ─── client row ─────────────────────────────────────────────────────────────

type Client = {
  id: string;
  notes?: string | null;
  user: { fullName: string; email: string };
};

function ClientRow({ client }: { client: Client }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const initials = getInitials(client.user.fullName);

  return (
    <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
      <GlassCard size="sm">
        <View className="flex-row items-center gap-3">
          {/* Avatar circle */}
          <View
            className="rounded-full items-center justify-center"
            style={{ width: 40, height: 40, backgroundColor: "rgba(46,91,66,0.22)" }}
          >
            <Text
              className="font-body-bold"
              style={{ color: "#4caf80", fontSize: 15 }}
            >
              {initials}
            </Text>
          </View>

          {/* Name + email */}
          <View className="flex-1 flex-col gap-0.5">
            <Text className="font-body-semibold text-foreground text-sm">
              {client.user.fullName}
            </Text>
            <Text className="text-xs text-muted">{client.user.email}</Text>
          </View>

          {/* Chevron — only shown when notes exist */}
          {client.notes ? (
            <Text className="text-muted text-xs">{expanded ? "▲" : "▼"}</Text>
          ) : null}
        </View>

        {/* Expanded notes */}
        {expanded && client.notes ? (
          <View className="mt-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
            <Text className="text-xs text-muted">
              {t("admin.clients.notes", { text: client.notes })}
            </Text>
          </View>
        ) : null}
      </GlassCard>
    </Pressable>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TrainerClients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const clientsQuery = useQuery(clientsQueries.list());
  const sessionsQuery = useQuery(sessionsQueries.list());
  const dateLocale = getDateLocale();

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    ]);
    setRefreshing(false);
  }

  const clients = clientsQuery.data?.clients ?? [];
  const scheduledSessions = (sessionsQuery.data?.sessions ?? []).filter(
    (s) => s.status === "SCHEDULED",
  );

  // Today stats
  const todaySessions = scheduledSessions.filter((s) => isToday(s.startsAt));
  const todayClientCount = todaySessions.length > 0 ? clients.length : 0;

  const grouped = groupSessionsByDate(scheduledSessions, dateLocale);

  return (
    <ScreenContainer title={t("tabs.clients")}>
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
        contentContainerStyle={{ gap: 24 }}
      >
        {/* ── Hero card — today stats ── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 80 }}
        >
          <HeroCard tone="default">
            <View className="flex-col gap-1">
              <SectionLabel>{t("trainer.clients.todayLabel", { defaultValue: "Today" })}</SectionLabel>
              <Text
                className="text-foreground font-body-bold"
                style={{ fontSize: 22, letterSpacing: -0.4, marginTop: 4 }}
              >
                {t("trainer.clients.todayStats", {
                  sessions: todaySessions.length,
                  clients: todayClientCount,
                  defaultValue: `${todaySessions.length} sessions today · ${todayClientCount} clients today`,
                })}
              </Text>
            </View>
          </HeroCard>
        </MotiView>

        {/* ── Error states ── */}
        {clientsQuery.isError ? (
          <ErrorState message={t("trainer.clients.error")} />
        ) : null}
        {sessionsQuery.isError ? (
          <ErrorState message={t("trainer.clients.sessionsError")} />
        ) : null}

        {/* ── Session groups ── */}
        {scheduledSessions.length === 0 ? (
          <EmptyState title={t("trainer.clients.noSessions")} />
        ) : (
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400, delay: 160 }}
          >
            <View className="flex-col gap-6 pb-8">
              {grouped.map(({ dateLabel, sessions: dateSessions }) => (
                <View key={dateLabel} className="flex-col gap-3">
                  {/* Date header */}
                  <SectionLabel>{dateLabel}</SectionLabel>

                  {/* Sessions in this date group */}
                  {dateSessions.map((session) => (
                    <View key={session.id} className="flex-col gap-2">
                      {/* Session subheader */}
                      <GlassCard size="md">
                        <View className="flex-row justify-between items-center">
                          <View className="flex-col gap-0.5 flex-1">
                            <Text className="font-body-semibold text-base text-foreground">
                              {(session as { classType?: { name?: string } }).classType?.name ??
                                t("trainer.clients.sessionName")}
                            </Text>
                            <Text className="text-xs text-muted">
                              {new Date(session.startsAt).toLocaleTimeString(dateLocale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {(session as unknown as { endsAt?: string }).endsAt
                                ? ` – ${new Date((session as unknown as { endsAt: string }).endsAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}`
                                : ""}
                            </Text>
                          </View>
                          <Badge status="neutral">
                            {t("trainer.clients.seats", {
                              count: (session as { capacity?: number }).capacity ?? 0,
                            })}
                          </Badge>
                        </View>
                      </GlassCard>

                      {/* Client rows */}
                      {clients.length > 0 ? (
                        <View className="flex-col ml-3 gap-1.5">
                          {clients.map((client) => (
                            <ClientRow key={client.id} client={client} />
                          ))}
                        </View>
                      ) : (
                        <Text className="text-muted ml-4 text-xs">
                          {t("trainer.clients.noClients")}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </MotiView>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
