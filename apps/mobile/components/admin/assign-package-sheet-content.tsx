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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";
import { SectionLabel } from "@/components/ui/typography";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { billingQueries } from "@/lib/queries/billing-queries-factory";

export type AssignPackageMode = "comp" | "paid";

const PAYMENT_METHODS = ["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const METHOD_LABEL_KEY: Record<PaymentMethod, string> = {
  CASH: "admin.manage.methodCash",
  CARD: "admin.manage.methodCard",
  COMPANY: "admin.manage.methodCompany",
  MANUAL_ONLINE: "admin.manage.methodOnline",
};

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
};

export function AssignPackageSheetContent({
  client,
  mode,
  onSuccess,
}: AssignPackageSheetContentProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Shared fields.
  const [packageTypeId, setPackageTypeId] = useState("");
  const [startsAt, setStartsAt] = useState("");

  // Paid-mode-only fields. Initialised regardless so the hook order is
  // stable across mode flips (the parent always remounts on sheet open, but
  // a future caller might toggle mode without unmounting).
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  const packageTypesQuery = useQuery(packagesQueries.types());
  const packageTypes = packageTypesQuery.data?.packageTypes ?? [];

  const compMutation = useMutation({
    ...packagesQueries.createClientPackage(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
      onSuccess();
    },
  });

  const paidMutation = useMutation({
    ...billingQueries.create(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["packages"] }),
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
      ]);
      onSuccess();
    },
  });

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
    if (mode === "comp") {
      compMutation.mutate({
        clientProfileId: client.id,
        packageTypeId,
        startsAt,
      });
      return;
    }
    // Paid path: the server transaction creates both rows or neither.
    paidMutation.mutate({
      clientUserId: client.user.id,
      packageTypeId,
      amount: Math.round(amountNumber),
      method,
      activatePackageOnConfirm: true,
    });
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
        {mode === "comp"
          ? t("admin.clients.compPackageHeading")
          : `${client.user.fullName} · ${client.user.email}`}
      </Text>

      <SectionLabel>{t("admin.clients.packageType")}</SectionLabel>
      {packageTypes.map((pt) => (
        <Button
          key={pt.id}
          testID={`assign-package-option-${pt.id}`}
          size="small"
          variant={packageTypeId === pt.id ? "primary" : "secondary"}
          onPress={() => setPackageTypeId(pt.id)}
        >
          {t("admin.clients.sessionsCount", { name: pt.name, count: pt.sessionCount })}
        </Button>
      ))}

      <Input
        placeholder={t("admin.clients.placeholderStart")}
        value={startsAt}
        onChangeText={setStartsAt}
      />

      {mode === "paid" ? (
        <>
          <SectionLabel>{t("admin.clients.paymentAmount")}</SectionLabel>
          <Input
            testID="assign-package-amount-input"
            placeholder={t("admin.clients.paymentAmount")}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          {amountError ? (
            <Text className="text-danger" style={{ fontSize: 12 }}>
              {amountError}
            </Text>
          ) : null}

          <SectionLabel>{t("admin.clients.paymentMethod.label")}</SectionLabel>
          {/* Buttons mirror the package-type picker above — visually
              consistent and fits 5 enum values without cramming. */}
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m}
              testID={`assign-package-method-${m}`}
              size="small"
              variant={method === m ? "primary" : "secondary"}
              onPress={() => setMethod(m)}
            >
              {t(METHOD_LABEL_KEY[m])}
            </Button>
          ))}
        </>
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
