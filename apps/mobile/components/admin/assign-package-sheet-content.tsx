// P2-5: Shared assign-package sheet body. One component, two submit paths.
//
//   mode="comp"  → POST /api/packages/client-packages (Dodeli paket / gift)
//   mode="paid"  → POST /api/billing with activatePackageOnConfirm: true
//                  (Nova uplata / new payment). That endpoint already wraps
//                  BillingRecord.create + ClientPackage.create in a Prisma
//                  $transaction, so the atomicity requirement is met without
//                  a schema migration. The two rows are correlated by
//                  (clientUserId, packageTypeId, createdAt); an explicit FK
//                  can land later if reporting needs it.
//
// The component is rendered inside an <AppSheet>; the parent unmounts it on
// close, so all local form state is reset between opens "for free".

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/states";
import { SectionLabel } from "@/components/ui/typography";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  packagesQueries,
  useAssignClientPackageMutation,
} from "@/lib/queries/packages-queries-factory";
import { useCreateBillingMutation } from "@/lib/queries/billing-queries-factory";
import { RAW_METHOD_LABEL_KEYS } from "@/lib/payment-method-labels";
import { assignedSamePackageToday } from "@/lib/same-day-package-assignment";
import { suggestedPackageStart } from "@/lib/suggested-package-start";
import { now } from "@/lib/now";
import { formatClassTypeList } from "@/lib/format";

export type AssignPackageMode = "comp" | "paid";

const PAYMENT_METHODS = ["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const METHOD_LABEL_KEY = RAW_METHOD_LABEL_KEYS;

export type AssignPackageSheetContentProps = {
  /**
   * The full client row used by both klijenti/index.tsx (list) and
   * klijenti/[id]/index.tsx (detail). `client.id` is the ClientProfile id
   * (used by the comp endpoint); `client.user.id` is the User id (used by
   * the billing endpoint).
   */
  client: {
    id: string;
    user: { id: string; fullName: string; email: string };
  };
  mode: AssignPackageMode;
  /** Called after a successful submit. Parents invalidate queries + close. */
  onSuccess: () => void;
  /**
   * Deep-link pre-selection: when set (e.g. from a BIRTHDAY_ADMIN_PROMPT
   * notification tap), the PackageType dropdown opens with this id already
   * selected. The admin can still pick a different PackageType if needed.
   * Uses the useState initializer pattern — no effect required.
   */
  initialPackageTypeId?: string;
  /**
   * Birthday deep-link marker (from a BIRTHDAY_ADMIN_PROMPT tap). Gifts no
   * longer carry their own class-type set — they inherit the real package's —
   * so this now only tells the sheet the assignment is a gift, and it opens
   * with the gift toggle already on. useState initializer — no effect.
   */
  initialClassTypeId?: string;
};

export function AssignPackageSheetContent({
  client,
  mode,
  onSuccess,
  initialPackageTypeId,
  initialClassTypeId,
}: AssignPackageSheetContentProps) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  // Shared fields.
  const [packageTypeId, setPackageTypeId] = useState(initialPackageTypeId ?? "");
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  // A gift is a real package handed over without payment. It covers whatever
  // that package covers, so there is no class-type picker any more. A birthday
  // deep-link (which always carries a class hint) is by definition a gift, so
  // it opens with the toggle already on.
  const [giftMode, setGiftMode] = useState(Boolean(initialClassTypeId));
  // Gifting "Reformer 12" must not hand over all twelve sessions, so a gift
  // defaults to one and the admin can raise it.
  const [giftSessions, setGiftSessions] = useState("1");

  // Paid-mode-only fields. Initialised regardless so the hook order is
  // stable across mode flips (the parent always remounts on sheet open, but
  // a future caller might toggle mode without unmounting).
  const [amount, setAmount] = useState("");
  // Once the admin types an amount, package-price prefills stop overriding
  // it — the manual value wins for the rest of the sheet's life.
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  // Pay-later ("Plaća kasnije"): the package still activates immediately so
  // the client can book right away; the BillingRecord lands as PENDING and
  // stays out of revenue until the admin confirms it in Naplata.
  const [payLater, setPayLater] = useState(false);

  const packageTypesQuery = useQuery(packagesQueries.types());
  const allPackageTypes = packageTypesQuery.data?.packageTypes ?? [];

  // Non-blocking duplicate hint: if this client already got the SAME package
  // type on the SAME day, show a note so an accidental repeat is noticed.
  // Stacking is fully supported (two cycles paid up front) — this NEVER
  // blocks the submit. The pilot saw four identical rows in two pairs; that
  // was intentional, but the note makes any future accident visible.
  const existingPackagesQuery = useQuery(packagesQueries.clientPackages(client.id));
  const existingPackages = existingPackagesQuery.data?.packages ?? [];

  // The date the picker shows until the admin picks something else. Derived,
  // not synced into state with an effect: `startsAt` stays null while
  // untouched, so the suggestion can update when the packages query lands
  // without ever fighting a value the admin has already chosen.
  //
  // Clients almost always renew AT their last session, so a client with a
  // usable package gets "the day after it runs out" — otherwise the new pack
  // would start midway through the old one. Everyone else gets today.
  const suggestedStart = suggestedPackageStart(existingPackages, now());
  const effectiveStartsAt = startsAt ?? suggestedStart;

  const alreadyAssignedToday = assignedSamePackageToday(
    existingPackages,
    packageTypeId,
    effectiveStartsAt,
  );
  // The legacy 🎂 SKUs are hidden everywhere now: a gift is a REAL package
  // handed over without payment (isGift), so it keeps a price and the trainer
  // is paid for teaching it. Selecting an unpriced gift SKU would create a
  // package worth nothing to the trainer.
  const packageTypes = allPackageTypes.filter((pt) => !pt.isBirthdayGift);

  const selectedType = packageTypes.find((pt) => pt.id === packageTypeId);
  // Gift mode is now a deliberate toggle on a real package, not a consequence
  // of which SKU was picked.
  const isGift = mode === "comp" && giftMode;

  // A gift can grant between one session and the package's own count —
  // anything more would be inventing sessions the package never had.
  const giftSessionsNumber = Number(giftSessions);
  const giftSessionsValid =
    giftSessions.trim() !== "" &&
    Number.isInteger(giftSessionsNumber) &&
    giftSessionsNumber >= 1 &&
    (!selectedType || giftSessionsNumber <= selectedType.sessionCount);

  // Cache upkeep (packages + clients packageStatus + reports) is baked into
  // the factory hooks; the component-only side-effect (close sheet) is
  // passed per-call via mutate(vars, { onSuccess }).
  const compMutation = useAssignClientPackageMutation();

  const paidMutation = useCreateBillingMutation();

  // Paid-mode validation: amount required + positive integer (RSD has no
  // sub-unit and the API schema requires `z.number().int().positive()`).
  const amountNumber = parseFloat(amount);
  const amountValid = amount.length > 0 && Number.isFinite(amountNumber) && amountNumber > 0;
  const amountError =
    amount.length === 0
      ? null
      : !amountValid
        ? t("admin.clients.amountPositive")
        : null;

  // The start date is always present now (suggested or picked), so it no
  // longer gates submit — the picker can't be left empty.
  const submitDisabled =
    mode === "comp"
      ? compMutation.isPending ||
        !packageTypeId ||
        (isGift && !giftSessionsValid)
      : paidMutation.isPending || !packageTypeId || !amountValid;

  function handleSubmit() {
    const startsAtIso = effectiveStartsAt.toISOString();
    if (mode === "comp") {
      compMutation.mutate(
        {
          clientProfileId: client.id,
          packageTypeId,
          startsAt: startsAtIso,
          // A gift keeps the real (priced) package so payroll can value its
          // sessions, but grants only the few the admin is actually giving.
          ...(isGift
            ? { isGift: true, sessionsGranted: Number(giftSessions) }
            : {}),
        },
        { onSuccess },
      );
      return;
    }
    // Paid path: the server transaction creates both rows or neither. With
    // pay-later the record lands as PENDING but the package activates
    // immediately — that's the whole point of the workflow. `startsAt` is the
    // picked day (start-of-day) — without it the server stamps the payment
    // instant and the picked date is silently ignored.
    paidMutation.mutate(
      {
        clientUserId: client.user.id,
        packageTypeId,
        amount: Math.round(amountNumber),
        method,
        status: payLater ? "PENDING" : "CONFIRMED",
        activatePackageOnConfirm: true,
        startsAt: startsAtIso,
      },
      { onSuccess },
    );
  }

  const submitLabel =
    mode === "comp"
      ? t("admin.clients.assign")
      : t("admin.clients.newPaymentSubmit");
  const submitError =
    mode === "comp"
      ? compMutation.isError
        ? t("admin.clients.assignError")
        : null
      : paidMutation.isError
        ? t("admin.clients.assignError")
        : null;

  return (
    <View className="flex-col gap-4">
      <Text
        className="text-muted"
        style={{ fontSize: 13 }}
      >
        {`${client.user.fullName} · ${client.user.email}`}
      </Text>

      {/* Option list, not a button stack: mix packages need a second line for
          the covered set, which a single-line Button label can't hold without
          truncating. Same anatomy as Select options — label + muted hint,
          accent check on the selected row. */}
      <View className="bg-glass border border-glass-border rounded-lg overflow-hidden">
        {packageTypes.map((pt, idx) => {
          const selected = packageTypeId === pt.id;
          return (
            <Pressable
              key={pt.id}
              testID={`assign-package-option-${pt.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              aria-pressed={selected}
              android_ripple={null}
              onPress={() => {
                setPackageTypeId(pt.id);
                // Prefill from the catalog price (still editable). Never
                // clobber an amount the admin already typed by hand.
                if (mode === "paid" && pt.price != null && !amountTouched) {
                  setAmount(String(pt.price));
                }
              }}
              className="active:opacity-70"
            >
              <View
                className={`flex-row items-center gap-3 px-3.5 py-3 ${
                  idx > 0 ? "border-t border-glass-border" : ""
                } ${selected ? "bg-accent-soft" : ""}`}
              >
                <View className="flex-1 gap-0.5">
                  <Text
                    className={`text-foreground ${
                      selected ? "font-body-semibold" : ""
                    }`}
                    style={{ fontSize: 14 }}
                    numberOfLines={1}
                  >
                    {pt.name}
                  </Text>
                  {/* Covered set only for mix packs — on single-type SKUs it
                      just repeats the name ("Reformer 8-pack" / "Reformer"). */}
                  {pt.classTypes.length > 1 ? (
                    <Text
                      className="text-muted"
                      style={{ fontSize: 12 }}
                      numberOfLines={1}
                    >
                      {formatClassTypeList(pt.classTypes.map((ct) => ct.name))}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-muted" style={{ fontSize: 12 }}>
                  {t("admin.clients.sessionsShort", { count: pt.sessionCount })}
                </Text>
                {selected ? (
                  <Icon name="check" size={13} color={tokens.accent} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Gift toggle — comp mode only. A gift hands over a REAL package
          without payment: it keeps the package price (so the trainer is paid
          for teaching it) but grants only the session or two being given. */}
      {mode === "comp" ? (
        <View className="flex-col gap-2">
          <Pressable
            testID="assign-gift-toggle"
            accessibilityRole="switch"
            accessibilityState={{ checked: giftMode }}
            aria-checked={giftMode}
            android_ripple={null}
            onPress={() => setGiftMode((prev) => !prev)}
            className="active:opacity-70"
          >
            <View className="bg-glass border border-glass-border rounded-lg flex-row items-center gap-3 px-3.5 py-3">
              <View className="flex-1">
                <Text className="text-foreground" style={{ fontSize: 14 }}>
                  {t("admin.clients.giftToggleLabel")}
                </Text>
                <Text className="text-muted" style={{ fontSize: 12 }}>
                  {t("admin.clients.giftToggleHint")}
                </Text>
              </View>
              {giftMode ? (
                <Icon name="check" size={13} color={tokens.accent} />
              ) : null}
            </View>
          </Pressable>

          {isGift ? (
            <View className="flex-col gap-1">
              <SectionLabel>{t("admin.clients.giftSessionsLabel")}</SectionLabel>
              <Input
                testID="assign-gift-sessions"
                value={giftSessions}
                onChangeText={setGiftSessions}
                keyboardType="number-pad"
                placeholder="1"
              />
              <Text className="text-muted" style={{ fontSize: 12 }}>
                {selectedType
                  ? t("admin.clients.giftSessionsHint", {
                      count: selectedType.sessionCount,
                    })
                  : t("admin.clients.giftSessionsHintNoPackage")}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <SectionLabel>{t("admin.clients.packageStartLabel")}</SectionLabel>
      <DateTimePicker
        testID="assign-package-start-picker"
        mode="date"
        value={effectiveStartsAt}
        onChange={setStartsAt}
        placeholder={t("admin.clients.placeholderStart")}
      />
      <Text className="text-muted" style={{ fontSize: 12 }}>
        {t("admin.clients.packageStartHint")}
      </Text>

      {mode === "paid" ? (
        <>
          <SectionLabel>{t("admin.clients.paymentAmount")}</SectionLabel>
          <Input
            testID="assign-package-amount-input"
            placeholder={t("admin.clients.paymentAmount")}
            keyboardType="numeric"
            inputMode="numeric"
            value={amount}
            onChangeText={(v) => {
              setAmountTouched(true);
              setAmount(v);
            }}
          />
          {amountError ? (
            <Text className="text-danger" style={{ fontSize: 12 }}>
              {amountError}
            </Text>
          ) : null}

          <SectionLabel>{t("admin.clients.paymentMethod.label")}</SectionLabel>
          <Select<PaymentMethod>
            testID="assign-package-method-select"
            optionTestIDPrefix="assign-package-method"
            placeholder={t("admin.clients.paymentMethod.label")}
            value={method}
            onChange={(v) => setMethod(v)}
            options={PAYMENT_METHODS.map((m) => ({
              value: m,
              label: t(METHOD_LABEL_KEY[m]),
            }))}
          />

          <SectionLabel>{t("admin.clients.paymentTimingLabel")}</SectionLabel>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                testID="assign-package-pay-now"
                size="small"
                variant={payLater ? "secondary" : "primary"}
                onPress={() => setPayLater(false)}
              >
                {t("admin.clients.payNow")}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                testID="assign-package-pay-later"
                size="small"
                variant={payLater ? "primary" : "secondary"}
                onPress={() => setPayLater(true)}
              >
                {t("admin.clients.payLater")}
              </Button>
            </View>
          </View>
          {payLater ? (
            <Text className="text-muted" style={{ fontSize: 12 }}>
              {t("admin.clients.payLaterHint")}
            </Text>
          ) : null}
        </>
      ) : null}

      {alreadyAssignedToday ? (
        <Text
          testID="assign-package-duplicate-hint"
          className="text-muted"
          style={{ fontSize: 12 }}
        >
          {t("admin.clients.duplicateSameDayHint")}
        </Text>
      ) : null}

      <Button
        testID="assign-package-submit"
        disabled={submitDisabled}
        onPress={handleSubmit}
      >
        {submitLabel}
      </Button>
      {submitError ? <ErrorState message={submitError} /> : null}
    </View>
  );
}
