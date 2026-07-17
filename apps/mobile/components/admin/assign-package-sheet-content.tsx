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
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/states";
import { SectionLabel } from "@/components/ui/typography";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  packagesQueries,
  useAssignClientPackageMutation,
} from "@/lib/queries/packages-queries-factory";
import { useCreateBillingMutation } from "@/lib/queries/billing-queries-factory";
import { RAW_METHOD_LABEL_KEYS } from "@/lib/payment-method-labels";
import { assignedSamePackageToday } from "@/lib/same-day-package-assignment";

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
};

export function AssignPackageSheetContent({
  client,
  mode,
  onSuccess,
  initialPackageTypeId,
}: AssignPackageSheetContentProps) {
  const { t } = useTranslation();

  // Shared fields.
  const [packageTypeId, setPackageTypeId] = useState(initialPackageTypeId ?? "");
  const [startsAt, setStartsAt] = useState<Date | null>(null);

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
  const alreadyAssignedToday = assignedSamePackageToday(
    existingPackages,
    packageTypeId,
    startsAt,
  );
  const packageTypes =
    mode === "paid"
      ? allPackageTypes.filter((pt) => !pt.isBirthdayGift)
      : allPackageTypes;

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

  const submitDisabled =
    mode === "comp"
      ? compMutation.isPending || !packageTypeId || !startsAt
      : paidMutation.isPending || !packageTypeId || !startsAt || !amountValid;

  function handleSubmit() {
    if (!startsAt) return;
    const startsAtIso = startsAt.toISOString();
    if (mode === "comp") {
      compMutation.mutate(
        {
          clientProfileId: client.id,
          packageTypeId,
          startsAt: startsAtIso,
        },
        { onSuccess },
      );
      return;
    }
    // Paid path: the server transaction creates both rows or neither. With
    // pay-later the record lands as PENDING but the package activates
    // immediately — that's the whole point of the workflow.
    paidMutation.mutate(
      {
        clientUserId: client.user.id,
        packageTypeId,
        amount: Math.round(amountNumber),
        method,
        status: payLater ? "PENDING" : "CONFIRMED",
        activatePackageOnConfirm: true,
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

      {packageTypes.map((pt) => (
        <Button
          key={pt.id}
          testID={`assign-package-option-${pt.id}`}
          size="small"
          variant={packageTypeId === pt.id ? "primary" : "secondary"}
          onPress={() => {
            setPackageTypeId(pt.id);
            // Prefill from the catalog price (still editable). Never
            // clobber an amount the admin already typed by hand.
            if (mode === "paid" && pt.price != null && !amountTouched) {
              setAmount(String(pt.price));
            }
          }}
        >
          {t("admin.clients.sessionsCount", { name: pt.name, count: pt.sessionCount })}
          {pt.classTypes.length > 1
            ? ` (${pt.classTypes.map((ct) => ct.name).join(" · ")})`
            : ""}
        </Button>
      ))}

      <DateTimePicker
        testID="assign-package-start-picker"
        mode="date"
        value={startsAt}
        onChange={setStartsAt}
        placeholder={t("admin.clients.placeholderStart")}
      />

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
