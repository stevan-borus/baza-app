/**
 * Design references (from docs/inspiration/):
 * - Fresha ios Oct 2024/ — service detail → confirm → success pattern, sticky CTA
 * - ClassPass ios May 2022/ — studio class booking sheet, capacity + credit display
 *
 * Structure: hero stripe with class name + time; metric rows for details;
 * status badges; two-step confirm for booking and cancellation.
 */
import React, { useState } from "react";
import { Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Haptics from "expo-haptics";
import { AppSheet } from "@/components/ui/sheet";
import { HeroCard } from "@/components/ui/hero-card";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricRow } from "@/components/ui/metric-row";
import type { AvailabilitySession } from "@baza/types";

type BookingStep = "idle" | "confirmBook" | "confirmCancel";

type Props = {
  session: AvailabilitySession | null;
  onClose: () => void;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
};

const classTypeColor: Record<string, string> = {
  Pilates: "#2e5b42",
  Yoga: "#2dd4bf",
  HIIT: "#f87171",
};

export function BookingSheet({
  session,
  onClose,
  onBook,
  onCancel,
  pending,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const [step, setStep] = useState<BookingStep>("idle");

  React.useEffect(() => {
    if (!session) setStep("idle");
  }, [session]);

  const isFull = !!session && session.availableSlots <= 0;
  const hasWaitlist = !!session && session.waitlistCount > 0;
  const durationMin = session
    ? dayjs(session.endsAt).diff(dayjs(session.startsAt), "minute")
    : 0;

  return (
    <AppSheet open={!!session} onOpenChange={(v) => !v && onClose()}>
      {session ? (
        <View className="flex-col gap-4">
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250 }}
          >
            <HeroCard tone="accent">
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        classTypeColor[session.classTypeName] ?? "#2e5b42",
                    }}
                  />
                  <Text className="text-xs font-body-semibold text-muted uppercase tracking-wider">
                    {session.classTypeName}
                  </Text>
                </View>
                <Text
                  className="text-foreground font-body-bold"
                  style={{ fontSize: 28, letterSpacing: -0.5 }}
                >
                  {dayjs(session.startsAt).format("HH:mm")} –{" "}
                  {dayjs(session.endsAt).format("HH:mm")}
                </Text>
                <Text className="text-muted text-sm">
                  {dayjs(session.startsAt).locale(lang).format("dddd, D MMMM")}
                </Text>
                <View className="flex-row gap-2 pt-1">
                  <Badge status={isFull ? "danger" : "success"}>
                    {isFull
                      ? t("client.calendar.full")
                      : t("client.calendar.availableSlots", {
                          count: session.availableSlots,
                        })}
                  </Badge>
                  {hasWaitlist ? (
                    <Badge status="warning">
                      {t("client.calendar.waitlistShort", {
                        count: session.waitlistCount,
                      })}
                    </Badge>
                  ) : null}
                </View>
              </View>
            </HeroCard>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250, delay: 80 }}
          >
            <GlassCard>
              <MetricRow
                label={t("client.calendar.room")}
                value={session.roomName ?? "—"}
                icon={
                  <FontAwesome
                    name="map-marker"
                    size={14}
                    color="rgba(255,255,255,0.5)"
                  />
                }
              />
              <MetricRow
                label={t("client.calendar.trainer")}
                value={session.trainerName ?? "—"}
                icon={
                  <FontAwesome
                    name="user"
                    size={14}
                    color="rgba(255,255,255,0.5)"
                  />
                }
              />
              <MetricRow
                label={t("client.dayView.duration", { minutes: durationMin })
                  .replace(String(durationMin), "")
                  .trim()}
                value={`${durationMin} min`}
                icon={
                  <FontAwesome
                    name="clock-o"
                    size={14}
                    color="rgba(255,255,255,0.5)"
                  />
                }
              />
              <MetricRow
                label={t("client.dayView.participants", {
                  count: session.bookedCount,
                  capacity: session.capacity,
                })
                  .split(" ")[0]
                  .replace(":", "")}
                value={`${session.bookedCount} / ${session.capacity}`}
                icon={
                  <FontAwesome
                    name="users"
                    size={14}
                    color="rgba(255,255,255,0.5)"
                  />
                }
              />
            </GlassCard>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250, delay: 160 }}
          >
            {step === "idle" ? (
              <View className="flex-row gap-3">
                {!isFull ? (
                  <Button
                    className="flex-1"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setStep("confirmBook");
                    }}
                    disabled={pending}
                  >
                    {t("client.calendar.book")}
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onPress={() => onBook(session.id)}
                    disabled={pending}
                  >
                    {t("client.dayView.joinWaitlist")}
                  </Button>
                )}
                <Button
                  className="flex-1"
                  variant="danger"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setStep("confirmCancel");
                  }}
                  disabled={pending}
                >
                  {t("client.calendar.cancel")}
                </Button>
              </View>
            ) : step === "confirmBook" ? (
              <View className="flex-col gap-3">
                <Text
                  className="text-foreground font-body-semibold text-[15px]"
                  style={{ textAlign: "center" }}
                >
                  {t("client.dayView.confirmBook")}
                </Text>
                <View className="flex-row gap-3">
                  <Button
                    className="flex-1"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      onBook(session.id);
                    }}
                    disabled={pending}
                  >
                    {t("client.dayView.confirm")}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onPress={() => setStep("idle")}
                  >
                    {t("client.calendar.cancel")}
                  </Button>
                </View>
              </View>
            ) : (
              <View className="flex-col gap-3">
                <Text
                  className="text-foreground font-body-semibold text-[15px]"
                  style={{ textAlign: "center" }}
                >
                  {t("client.dayView.cancelWarning")}
                </Text>
                <View className="flex-row gap-3">
                  <Button
                    className="flex-1"
                    variant="danger"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      onCancel(session.id);
                    }}
                    disabled={pending}
                  >
                    {t("client.dayView.confirm")}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onPress={() => setStep("idle")}
                  >
                    {t("client.calendar.cancel")}
                  </Button>
                </View>
              </View>
            )}
          </MotiView>
        </View>
      ) : null}
    </AppSheet>
  );
}
