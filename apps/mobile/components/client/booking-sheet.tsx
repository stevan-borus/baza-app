/**
 * Design references (from docs/inspiration/):
 * - Fresha ios Oct 2024/ — service detail → confirm → success pattern, sticky CTA
 * - ClassPass ios May 2022/ — studio class booking sheet, capacity + credit display
 *
 * Structure: hero stripe with class name + time; metric rows for details;
 * status badges; two-step confirm for booking and cancellation.
 */
import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/components/ui/icon";
import * as Haptics from "expo-haptics";
import { AppSheet } from "@/components/ui/sheet";
import { isInLateCancelWindow } from "@/lib/late-cancel";
import { nowMs } from "@/lib/now";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IntermediateBadge } from "@/components/ui/intermediate-badge";
import { useThemeTokens, type ThemeTokens } from "@/components/ui/tokens";
import type { AvailabilitySession } from "@baza/types/scheduling";

type BookingStep =
  | "idle"
  | "confirmBook"
  | "confirmCancel"
  | "confirmLeaveWaitlist"
  | "success"
  | "error";

type Props = {
  session: AvailabilitySession | null;
  onClose: () => void;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  onLeaveWaitlist: (id: string) => void;
  pending: boolean;
  /** Set after a successful mutation so the sheet replaces its buttons with a confirmation block. */
  successState: "BOOKED" | "WAITLISTED" | "CANCELED" | "LEFT_WAITLIST" | null;
  /** Server error code (e.g. GUARDIAN_VERIFICATION_REQUIRED) when the mutation fails. */
  errorCode: string | null;
  /** Step to open on for a freshly-opened session. "confirmCancel" lets the
   * overview's OTKAŽI jump straight to cancel confirmation. Defaults "idle". */
  initialStep?: BookingStep;
};

export function BookingSheet({
  session,
  onClose,
  onBook,
  onCancel,
  onLeaveWaitlist,
  pending,
  successState,
  errorCode,
  initialStep = "idle",
}: Props) {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const lang = i18n.language === "en" ? "en" : "sr";
  const [step, setStep] = useState<BookingStep>(initialStep);

  // Snapshot of `lastBookableSlot` taken when the user fires the booking
  // mutation. The success block can't read the live flag: the availability
  // refetch that lands with the success flips it to false (the new booking
  // now counts as a hold), which is exactly when we still owe the warning.
  const bookedLastSlotRef = useRef(false);

  // Seed the step when a new session opens (id changes) — render-time state
  // adjustment, not an effect. After that the user drives `step` via taps.
  const openedId = useRef<string | null>(null);
  if (session && session.id !== openedId.current) {
    openedId.current = session.id;
    bookedLastSlotRef.current = false;
    if (step !== initialStep) setStep(initialStep);
  }
  if (!session && openedId.current !== null) {
    openedId.current = null;
    bookedLastSlotRef.current = false;
  }

  function handleClose() {
    setStep("idle");
    onClose();
  }

  const isFull = !!session && session.availableSlots <= 0;
  // No eligible package for this class (expired / used up / paused): the
  // session is visible but not bookable — the sheet swaps its actions for a
  // renewal message. Undefined counts as bookable (staff / older payloads).
  const renewalLocked = !!session && session.bookable === false;
  const isLastSlot = !!session?.lastBookableSlot;
  // A waitlist only makes sense once the class is full — only then can someone
  // actually be waiting for a seat. Gate on isFull so a stray/seed waitlist
  // count never surfaces on a class that still has open spots.
  const hasWaitlist = isFull && !!session && session.waitlistCount > 0;
  const isBookedByMe = !!session?.isBookedByMe;
  // On the waitlist for this (full) class — the sheet shows a "leave waitlist"
  // state instead of the "join waitlist" button.
  const isWaitlistedByMe = !!session?.isWaitlistedByMe;
  // A session that has already started/passed can't be booked. The server
  // rejects it too (SESSION_IN_PAST) — this just hides the CTA up front.
  const isPast =
    !!session && dayjs(session.startsAt).valueOf() <= dayjs().valueOf();
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
  // Late-cancel predicate mirroring BOTH halves of the server policy
  // (cancellation-policy): a cancel forfeits one package session only inside
  // the lateCancelHours window AND before the session starts — the server
  // never forfeits post-start, and cancel stays reachable after start. Drives
  // BOTH the confirm-step warning and the post-cancel result copy, so an
  // early or post-start cancel never sees the scary forfeit text.
  const lateCancelHours = session?.lateCancelHours;
  const isLateCancel =
    !!session &&
    lateCancelHours != null &&
    isInLateCancelWindow(
      dayjs(session.startsAt).valueOf(),
      nowMs(),
      lateCancelHours,
    );

  return (
    <AppSheet open={!!session} onOpenChange={(v) => !v && handleClose()}>
      {session ? (
        <View className="flex-col gap-5">
          {/* Header — class eyebrow, big time headline, date + availability,
              sitting directly on the sheet surface (no card chrome). */}
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250 }}
          >
            <View className="gap-1.5">
              <Text className="text-xs font-body-semibold text-muted uppercase tracking-wider">
                {session.classTypeName}
              </Text>
              <Text
                className="text-foreground font-display"
                style={{ fontSize: 34, letterSpacing: -0.5, lineHeight: 38 }}
              >
                {dayjs(session.startsAt).format("HH:mm")} –{" "}
                {dayjs(session.endsAt).format("HH:mm")}
              </Text>
              {/* The sheet doubles as the legend: the mark expands to
                  "★ Srednji nivo" here (dense rows show the bare glyph). */}
              <IntermediateBadge isIntermediate={session.isIntermediate} size="detail" showLabel />
              <View className="flex-row items-center gap-2.5 pt-0.5">
                <Text className="text-muted text-sm">
                  {dayjs(session.startsAt).locale(lang).format("dddd, D MMMM")}
                </Text>
                <View className="w-1 h-1 rounded-full bg-glass-border" />
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
          </MotiView>

          {/* Details — hairline-separated rows, no enclosing box. */}
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250, delay: 80 }}
          >
            <View className="border-t border-glass-border">
              <DetailRow
                icon="map-marker"
                label={t("client.calendar.room")}
                value={session.roomName ?? "—"}
                valueTestID="booking-detail-room"
                tokens={tokens}
              />
              <DetailRow
                icon="user"
                label={t("client.calendar.trainer")}
                value={session.trainerName ?? "—"}
                valueTestID="booking-detail-trainer"
                tokens={tokens}
              />
              <DetailRow
                icon="clock-o"
                label={t("client.dayView.durationLabel")}
                value={`${durationMin} min`}
                valueTestID="booking-detail-duration"
                tokens={tokens}
              />
              <DetailRow
                icon="users"
                label={t("client.dayView.participantsLabel")}
                value={`${session.bookedCount} / ${session.capacity}`}
                valueTestID="booking-detail-capacity"
                tokens={tokens}
                last
              />
            </View>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 250, delay: 160 }}
          >
            {effectiveStep === "idle" ? (
              isBookedByMe ? (
                isPast ? (
                  // Booked, but the session has already started — a client can't
                  // cancel a started session (the server returns
                  // SESSION_ALREADY_STARTED). Show the booked confirmation plus a
                  // plain status line, no tappable cancel button.
                  <View className="flex-col gap-3">
                    <View className="flex-row items-center justify-center gap-2">
                      <Icon name="check-circle" size={16} color={tokens.accentLight} />
                      <Text className="font-body-semibold text-accent-light text-[14px]">
                        {t("client.dayView.alreadyBooked")}
                      </Text>
                    </View>
                    <View
                      testID="booking-past-state"
                      className="flex-row items-center justify-center gap-2 py-2"
                    >
                      <Icon name="clock-o" size={14} color={tokens.faint} />
                      <Text className="text-muted text-[13px]">
                        {t("client.dayView.sessionPast")}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="flex-col gap-3">
                    <View className="flex-row items-center justify-center gap-2">
                      <Icon name="check-circle" size={16} color={tokens.accentLight} />
                      <Text className="font-body-semibold text-accent-light text-[14px]">
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
                )
              ) : isPast ? (
                // No action is possible, so this is plain status text — not a
                // button-shaped element that invites a tap.
                <View
                  testID="booking-past-state"
                  className="flex-row items-center justify-center gap-2 py-2"
                >
                  <Icon name="clock-o" size={14} color={tokens.faint} />
                  <Text className="text-muted text-[13px]">
                    {t("client.dayView.sessionPast")}
                  </Text>
                </View>
              ) : isWaitlistedByMe ? (
                // Already on the waitlist for this full class — offer to leave
                // (which frees the reserved session), not to join again.
                // Deliberately checked BEFORE renewalLocked: the client's own
                // waitlist entry can BE the held session that makes this
                // session FULLY_HELD, so a lock check first would trap the very
                // person who needs to leave behind a "renew" message.
                <View className="flex-col gap-3">
                  <View className="flex-row items-center justify-center gap-2">
                    <Icon name="clock-o" size={16} color="#a17d3a" />
                    <Text className="font-body-semibold text-warning text-[14px]">
                      {t("client.dayView.onWaitlist")}
                    </Text>
                  </View>
                  <Button
                    testID="booking-leave-waitlist-button"
                    variant="danger"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setStep("confirmLeaveWaitlist");
                    }}
                    disabled={pending}
                  >
                    {t("client.dayView.leaveWaitlist")}
                  </Button>
                </View>
              ) : renewalLocked ? (
                // No book/waitlist actions — the client can't book this one.
                // The server's 409 stays as the backstop if a stale sheet
                // slips through. Plain informational block, not a disabled
                // button. Each lock reason gets its own copy + testID:
                // FULLY_HELD / PAUSED / NOT_STARTED each need a distinct,
                // truthful message — telling a paused or not-yet-started client
                // to "renew" would be wrong and confusing. RENEW is the
                // fallback (also covers older payloads with no lockReason).
                (() => {
                  const lock = renewalLockCopy(session.lockReason);
                  return (
                    <View
                      testID={lock.testID}
                      className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
                    >
                      <Icon name="info-circle" size={18} color="#a17d3a" />
                      <Text className="flex-1 text-[14px] text-warning font-body-semibold">
                        {t(lock.messageKey)}
                      </Text>
                    </View>
                  );
                })()
              ) : isFull ? (
                <View className="flex-col gap-3">
                  <Button
                    testID="booking-waitlist-button"
                    variant="secondary"
                    onPress={() => {
                      bookedLastSlotRef.current = isLastSlot;
                      onBook(session.id);
                    }}
                    disabled={pending}
                  >
                    {t("client.dayView.joinWaitlist")}
                  </Button>
                  {/* Every waitlist join reserves a package session — say so up
                      front (not just at the last-slot edge), plus the auto-
                      release + leave escape hatch. Last slot adds the renew line. */}
                  <View
                    testID="booking-waitlist-reserve-note"
                    className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
                  >
                    <Icon name="info-circle" size={16} color="#a17d3a" />
                    <View className="flex-1 flex-col gap-1">
                      <Text className="text-[13px] text-warning font-body-medium">
                        {t("client.renewal.waitlistReservesSession")}
                      </Text>
                      {isLastSlot ? (
                        <Text
                          testID="booking-waitlist-last-slot-note"
                          className="text-[13px] text-warning font-body-semibold"
                        >
                          {t("client.renewal.lastSessionWaitlistWarning")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
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
                {isLastSlot ? (
                  <View
                    testID="booking-last-slot-warning"
                    className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
                  >
                    <Icon name="info-circle" size={16} color="#a17d3a" />
                    <Text className="flex-1 text-[13px] text-warning font-body-medium">
                      {t("client.renewal.lastSessionWarning")}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-col gap-2">
                  <Button
                    testID="booking-confirm-book-button"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      bookedLastSlotRef.current = isLastSlot;
                      onBook(session.id);
                    }}
                    disabled={pending}
                  >
                    {t("client.dayView.confirm")}
                  </Button>
                  <Button
                    testID="booking-confirm-book-back-button"
                    variant="ghost"
                    onPress={() => setStep("idle")}
                  >
                    {t("common.back", { defaultValue: "Nazad" })}
                  </Button>
                </View>
              </View>
            ) : effectiveStep === "confirmCancel" ? (
              (() => {
                // Cancellation is allowed any time. If it lands inside the
                // late-cancel window, one session from the package is
                // deducted — warn explicitly so the client makes an informed
                // decision before tapping Potvrdi.
                const warningText = isLateCancel
                  ? t("client.dayView.cancelWarningLate", {
                      hours: lateCancelHours,
                    })
                  : t("client.dayView.cancelWarning");
                return (
                  <View className="flex-col gap-3">
                    <Text
                      testID="booking-cancel-warning"
                      accessibilityLabel={warningText}
                      className="text-foreground font-body-semibold text-[15px]"
                      style={{ textAlign: "center" }}
                    >
                      {warningText}
                    </Text>
                    <View className="flex-col gap-2">
                      <Button
                        testID="booking-confirm-cancel-button"
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
                        variant="ghost"
                        onPress={() => setStep("idle")}
                      >
                        {t("common.back", { defaultValue: "Nazad" })}
                      </Button>
                    </View>
                  </View>
                );
              })()
            ) : effectiveStep === "confirmLeaveWaitlist" ? (
              // Leaving the waitlist frees the reserved session — no forfeit,
              // no penalty. Confirm step mirrors the cancel flow so a tap can't
              // do it by accident.
              <View className="flex-col gap-3">
                <Text
                  testID="booking-leave-waitlist-warning"
                  className="text-foreground font-body-semibold text-[15px]"
                  style={{ textAlign: "center" }}
                >
                  {t("client.dayView.confirmLeaveWaitlist")}
                </Text>
                <View className="flex-col gap-2">
                  <Button
                    testID="booking-confirm-leave-waitlist-button"
                    variant="danger"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      onLeaveWaitlist(session.id);
                    }}
                    disabled={pending}
                  >
                    {t("client.dayView.confirm")}
                  </Button>
                  <Button
                    testID="booking-confirm-leave-waitlist-back-button"
                    variant="ghost"
                    onPress={() => setStep("idle")}
                  >
                    {t("common.back", { defaultValue: "Nazad" })}
                  </Button>
                </View>
              </View>
            ) : effectiveStep === "success" ? (
              (() => {
                // A LATE cancel forfeited one package session — say so in the
                // result, not just in the pre-confirm warning. Early cancels
                // keep the neutral copy.
                // CANCELED and LEFT_WAITLIST are both "you undid something"
                // outcomes — neutral (amber info) styling, not the green check.
                const isNeutralOutcome =
                  successState === "CANCELED" || successState === "LEFT_WAITLIST";
                const successText =
                  successState === "BOOKED"
                    ? t("client.calendar.bookingBooked")
                    : successState === "WAITLISTED"
                      ? t("client.calendar.bookingWaitlisted")
                      : successState === "LEFT_WAITLIST"
                        ? t("client.calendar.waitlistLeft")
                        : successState === "CANCELED"
                          ? isLateCancel
                            ? t("client.calendar.bookingCanceledLate")
                            : t("client.calendar.bookingCanceled")
                          : "";
                return (
                  <View className="flex-col gap-2">
                    <View className="flex-row items-center justify-center gap-2 py-3">
                      <Icon
                        name={isNeutralOutcome ? "info-circle" : "check-circle"}
                        size={18}
                        color={isNeutralOutcome ? "#a17d3a" : tokens.accent}
                      />
                      <Text
                        testID="booking-success-message"
                        accessibilityLabel={successText}
                        className="font-body-semibold text-[15px] flex-shrink"
                        style={{
                          color: isNeutralOutcome ? "#a17d3a" : "#2e5b42",
                        }}
                      >
                        {successText}
                      </Text>
                    </View>
                    {/* A waitlist join reserves a session — restate that after
                        the join (reserves + auto-release + leave option), plus
                        the "last one, renew" line when it was the last slot.
                        The snapshot drives the last-slot line: the availability
                        refetch flips lastBookableSlot off once the seat counts
                        as a hold, but the client still needs to hear it. */}
                    {successState === "WAITLISTED" ? (
                      <View
                        testID="booking-success-waitlist-note"
                        className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
                      >
                        <Icon name="info-circle" size={16} color="#a17d3a" />
                        <View className="flex-1 flex-col gap-1">
                          <Text className="text-[13px] text-warning font-body-medium">
                            {t("client.renewal.waitlistReservesSession")}
                          </Text>
                          {bookedLastSlotRef.current ? (
                            <Text
                              testID="booking-success-last-slot-warning"
                              className="text-[13px] text-warning font-body-semibold"
                            >
                              {t("client.renewal.lastSessionWaitlistWarning")}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ) : bookedLastSlotRef.current && successState === "BOOKED" ? (
                      <View
                        testID="booking-success-last-slot-warning"
                        className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-warning/40 bg-warning-soft"
                      >
                        <Icon name="info-circle" size={16} color="#a17d3a" />
                        <Text className="flex-1 text-[13px] text-warning font-body-medium">
                          {t("client.renewal.lastSessionWarning")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })()
            ) : (
              <View className="flex-row items-start gap-2 px-3 py-3 rounded-xl border border-danger/40 bg-danger-soft">
                <Icon
                  name="exclamation-circle"
                  size={18}
                  color={tokens.danger}
                />
                <Text
                  testID="booking-error-message"
                  className="flex-1 text-[14px] text-danger font-body-semibold"
                >
                  {errorCode === "GUARDIAN_VERIFICATION_REQUIRED"
                    ? t("client.calendar.errorGuardianRequired")
                    : errorCode === "no_package_for_class"
                      ? t("client.calendar.errorNoPackage")
                      : errorCode === "PACKAGE_EXHAUSTED"
                        ? t("client.calendar.errorPackageExhausted")
                        : errorCode === "SESSION_IN_PAST"
                          ? t("client.calendar.errorSessionPast")
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

/**
 * Copy + testID for the renewal-lock informational block, one per lockReason.
 * RENEW is the fallback and also covers older payloads that carry no reason.
 * testIDs for RENEW and FULLY_HELD are unchanged so existing specs keep
 * matching; PAUSED / NOT_STARTED get their own.
 */
function renewalLockCopy(lockReason: AvailabilitySession["lockReason"]): {
  testID: string;
  messageKey: string;
} {
  switch (lockReason) {
    case "FULLY_HELD":
      return {
        testID: "booking-fully-held-message",
        messageKey: "client.renewal.fullyHeldMessage",
      };
    case "PAUSED":
      return {
        testID: "booking-paused-message",
        messageKey: "client.renewal.pausedMessage",
      };
    case "NOT_STARTED":
      return {
        testID: "booking-not-started-message",
        messageKey: "client.renewal.notStartedMessage",
      };
    default:
      return {
        testID: "booking-renewal-message",
        messageKey: "client.renewal.message",
      };
  }
}

/**
 * One key/value line in the flat details list — leading icon + label on the
 * left, value on the right, separated from the next row by a hairline. No
 * enclosing card; the rows sit directly on the sheet surface.
 */
function DetailRow({
  icon,
  label,
  value,
  valueTestID,
  tokens,
  last,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueTestID?: string;
  tokens: ThemeTokens;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between py-3.5 ${
        last ? "" : "border-b border-glass-border"
      }`}
    >
      <View className="flex-row items-center gap-3">
        <Icon name={icon} size={15} color={tokens.faint} />
        <Text className="text-sm text-muted">{label}</Text>
      </View>
      <Text
        testID={valueTestID}
        className="font-body-medium text-sm text-foreground"
      >
        {value}
      </Text>
    </View>
  );
}
