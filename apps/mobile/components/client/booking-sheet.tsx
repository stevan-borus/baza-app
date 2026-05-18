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

type BookingStep = "idle" | "confirmBook" | "confirmCancel" | "success" | "error";

type Props = {
  session: AvailabilitySession | null;
  onClose: () => void;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
  /** Set after a successful mutation so the sheet replaces its buttons with a confirmation block. */
  successState: "BOOKED" | "WAITLISTED" | "CANCELED" | null;
  /** Server error code (e.g. GUARDIAN_VERIFICATION_REQUIRED) when the mutation fails. */
  errorCode: string | null;
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
  successState,
  errorCode,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const [step, setStep] = useState<BookingStep>("idle");

  function handleClose() {
    setStep("idle");
    onClose();
  }

  const isFull = !!session && session.availableSlots <= 0;
  const hasWaitlist = !!session && session.waitlistCount > 0;
  const isBookedByMe = !!session?.isBookedByMe;
  // Success / error state is owned by the parent (driven by the mutation
  // result), not by local UI state — so it doesn't need a useEffect to sync.
  // When either is present, the buttons area is replaced with the
  // corresponding block regardless of the local `step`.
  const effectiveStep: BookingStep = errorCode
    ? "error"
    : successState
      ? "success"
      : step;
  const durationMin = session
    ? dayjs(session.endsAt).diff(dayjs(session.startsAt), "minute")
    : 0;

  return (
    <AppSheet open={!!session} onOpenChange={(v) => !v && handleClose()}>
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
                valueTestID="booking-detail-room"
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
                valueTestID="booking-detail-trainer"
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
                valueTestID="booking-detail-duration"
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
                valueTestID="booking-detail-capacity"
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
            {effectiveStep === "idle" ? (
              isBookedByMe ? (
                <View className="flex-col gap-3">
                  <View className="flex-row items-center justify-center gap-2">
                    <FontAwesome name="check-circle" size={16} color="#2e5b42" />
                    <Text className="font-body-semibold text-accent text-[14px]">
                      {t("client.dayView.alreadyBooked")}
                    </Text>
                  </View>
                  <Button
                    testID="booking-cancel-button"
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
              ) : isFull ? (
                <Button
                  testID="booking-waitlist-button"
                  variant="secondary"
                  onPress={() => onBook(session.id)}
                  disabled={pending}
                >
                  {t("client.dayView.joinWaitlist")}
                </Button>
              ) : (
                <Button
                  testID="booking-book-button"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setStep("confirmBook");
                  }}
                  disabled={pending}
                >
                  {t("client.calendar.book")}
                </Button>
              )
            ) : effectiveStep === "confirmBook" ? (
              <View className="flex-col gap-3">
                <Text
                  className="text-foreground font-body-semibold text-[15px]"
                  style={{ textAlign: "center" }}
                >
                  {t("client.dayView.confirmBook")}
                </Text>
                <View className="flex-row gap-3">
                  <Button
                    testID="booking-confirm-book-button"
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
                    testID="booking-confirm-book-back-button"
                    className="flex-1"
                    variant="secondary"
                    onPress={() => setStep("idle")}
                  >
                    {t("client.calendar.cancel")}
                  </Button>
                </View>
              </View>
            ) : effectiveStep === "confirmCancel" ? (
              (() => {
                // Cancellation is allowed any time. If it lands inside the
                // late-cancel window, one session from the package is
                // deducted — warn explicitly so the client makes an informed
                // decision before tapping Potvrdi.
                const hours = session.lateCancelHours;
                const isLate =
                  hours != null &&
                  dayjs(session.startsAt).diff(dayjs(), "hour", true) < hours;
                return (
                  <View className="flex-col gap-3">
                    <Text
                      className="text-foreground font-body-semibold text-[15px]"
                      style={{ textAlign: "center" }}
                    >
                      {isLate
                        ? t("client.dayView.cancelWarningLate", { hours })
                        : t("client.dayView.cancelWarning")}
                    </Text>
                    <View className="flex-row gap-3">
                      <Button
                        testID="booking-confirm-cancel-button"
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
                        testID="booking-confirm-cancel-back-button"
                        className="flex-1"
                        variant="secondary"
                        onPress={() => setStep("idle")}
                      >
                        {t("client.calendar.cancel")}
                      </Button>
                    </View>
                  </View>
                );
              })()
            ) : effectiveStep === "success" ? (
              <View className="flex-row items-center justify-center gap-2 py-3">
                <FontAwesome
                  name={successState === "CANCELED" ? "info-circle" : "check-circle"}
                  size={18}
                  color={successState === "CANCELED" ? "#a17d3a" : "#2e5b42"}
                />
                <Text
                  testID="booking-success-message"
                  className="font-body-semibold text-[15px]"
                  style={{
                    color: successState === "CANCELED" ? "#a17d3a" : "#2e5b42",
                  }}
                >
                  {successState === "BOOKED"
                    ? t("client.calendar.bookingBooked")
                    : successState === "WAITLISTED"
                      ? t("client.calendar.bookingWaitlisted")
                      : successState === "CANCELED"
                        ? t("client.calendar.bookingCanceled")
                        : ""}
                </Text>
              </View>
            ) : (
              <View className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-danger/40 bg-danger-soft">
                <FontAwesome
                  name="exclamation-circle"
                  size={18}
                  color="#dc2626"
                  style={{ marginTop: 1 }}
                />
                <Text
                  testID="booking-error-message"
                  className="flex-1 text-[14px] text-danger font-body-semibold"
                >
                  {errorCode === "GUARDIAN_VERIFICATION_REQUIRED"
                    ? t("client.calendar.errorGuardianRequired")
                    : errorCode === "no_package_for_class"
                      ? t("client.calendar.errorNoPackage")
                      : t("client.calendar.bookingError")}
                </Text>
              </View>
            )}
          </MotiView>
        </View>
      ) : null}
    </AppSheet>
  );
}
