/**
 * Campaign compose — title + body + ALL SIX audience axes + a LIVE reach
 * preview, plus save-draft / send-now / schedule actions.
 *
 * The reach count is a useQuery keyed on the derived audience spec (NOT a
 * setup useEffect): as the admin flips axes, `toSpec(axes)` recomputes each
 * render and the query refetches per-spec, so the number on screen is the
 * SAME one the dispatch will resolve.
 *
 * The UI mirrors the schema's exclusivity rules so it can never build a spec
 * the server rejects:
 *   - turning on `everyone` clears every narrowing axis (and the narrowing
 *     axes are hidden while it's on);
 *   - `lapsed` and `idlePackage` are mutually contradictory (one means "no
 *     active package", the other "has an active package"), so enabling either
 *     clears the other.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { CampaignAudienceSpec } from "@baza/types";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  campaignsQueries,
  useCreateCampaignMutation,
} from "@/lib/queries/campaigns-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";

type PackageState = "active" | "expired" | "none" | "paused";
const PACKAGE_STATES: PackageState[] = ["active", "expired", "none", "paused"];

const DEFAULT_EXPIRING_SOON = 14;
const DEFAULT_LAPSED = 30;
const DEFAULT_IDLE = 7;

type AxesState = {
  everyone: boolean;
  packageState?: PackageState;
  classTypeId?: string;
  expiringSoonDays?: number;
  lapsedDays?: number;
  idlePackageDays?: number;
};

/** Derive the stored-intent spec from the UI axes. Returns null when nothing
 *  is chosen (the preview query stays disabled and submit is blocked). */
function toSpec(axes: AxesState): CampaignAudienceSpec | null {
  if (axes.everyone) return { everyone: true };
  const spec: CampaignAudienceSpec = {};
  if (axes.packageState) spec.packageState = axes.packageState;
  if (axes.classTypeId) spec.classTypeId = axes.classTypeId;
  if (axes.expiringSoonDays) spec.expiringSoonDays = axes.expiringSoonDays;
  if (axes.lapsedDays) spec.lapsedDays = axes.lapsedDays;
  if (axes.idlePackageDays) spec.idlePackageDays = axes.idlePackageDays;
  return Object.keys(spec).length > 0 ? spec : null;
}

/** Parse a day-count text field to a positive int clamped to >=1, capped at
 *  365 (the schema's max), falling back to a default for empty / non-numeric
 *  so we never build a spec the schema rejects. */
function parseDays(text: string, fallback: number): number {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 365);
}

export default function CampaignCompose() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [axes, setAxes] = useState<AxesState>({ everyone: false });

  const spec = toSpec(axes);
  const previewQuery = useQuery(campaignsQueries.preview(spec));
  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  // The factory hook bakes in the ["campaigns"] invalidation; navigation is the
  // only screen-specific side effect, passed per-call below.
  const createMutation = useCreateCampaignMutation();

  // Dispatching to a whole audience is irreversible, so send-now / schedule go
  // through a confirmation sheet; saving a draft does not.
  const [pendingSend, setPendingSend] = useState<
    { sendNow?: boolean; scheduledFor?: string } | null
  >(null);

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    spec !== null &&
    !createMutation.isPending;

  function submit(extra: { sendNow?: boolean; scheduledFor?: string }) {
    if (!canSubmit || spec === null) return;
    createMutation.reset();
    createMutation.mutate(
      { title, body, audienceSpec: spec, ...extra },
      {
        onSuccess: () => {
          setPendingSend(null);
          router.back();
        },
      },
    );
  }

  // Save-draft is non-destructive — submit immediately. Send-now/schedule ask
  // for confirmation first (they message the whole audience).
  function requestSend(extra: { sendNow?: boolean; scheduledFor?: string }) {
    if (!canSubmit) return;
    setPendingSend(extra);
  }

  // ── Axis togglers — each enforces the schema's exclusivity invariants ──
  function toggleEveryone() {
    setAxes((a) =>
      a.everyone ? { everyone: false } : { everyone: true },
    );
  }
  function selectPackageState(value: PackageState) {
    setAxes((a) => ({
      ...a,
      packageState: a.packageState === value ? undefined : value,
    }));
  }
  function selectClassType(id: string) {
    setAxes((a) => ({
      ...a,
      classTypeId: a.classTypeId === id ? undefined : id,
    }));
  }
  function toggleExpiringSoon() {
    setAxes((a) => ({
      ...a,
      expiringSoonDays:
        a.expiringSoonDays === undefined ? DEFAULT_EXPIRING_SOON : undefined,
    }));
  }
  function toggleLapsed() {
    setAxes((a) =>
      a.lapsedDays === undefined
        ? // enabling lapsed clears idlePackage (mutually exclusive)
          { ...a, lapsedDays: DEFAULT_LAPSED, idlePackageDays: undefined }
        : { ...a, lapsedDays: undefined },
    );
  }
  function toggleIdlePackage() {
    setAxes((a) =>
      a.idlePackageDays === undefined
        ? // enabling idlePackage clears lapsed (mutually exclusive)
          { ...a, idlePackageDays: DEFAULT_IDLE, lapsedDays: undefined }
        : { ...a, idlePackageDays: undefined },
    );
  }

  const previewCount = previewQuery.data?.count ?? 0;

  return (
    <ScreenContainerRaw title={t("campaigns.compose.title")} headerVariant="detail">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
        {/* ── Message ─────────────────────────────────────────────── */}
        <View className="gap-2">
          <Text className="text-muted font-body-medium" style={{ fontSize: 13 }}>
            {t("campaigns.compose.titleLabel")}
          </Text>
          <TextInput
            testID="campaign-title-input"
            value={title}
            onChangeText={setTitle}
            placeholder={t("campaigns.compose.titlePlaceholder")}
            placeholderTextColor={tokens.faint}
            className="bg-surface border border-glass-border rounded-2xl px-4 text-foreground"
            style={{ height: 48 }}
          />
        </View>
        <View className="gap-2">
          <Text className="text-muted font-body-medium" style={{ fontSize: 13 }}>
            {t("campaigns.compose.bodyLabel")}
          </Text>
          <TextInput
            testID="campaign-body-input"
            value={body}
            onChangeText={setBody}
            placeholder={t("campaigns.compose.bodyPlaceholder")}
            placeholderTextColor={tokens.faint}
            multiline
            textAlignVertical="top"
            className="bg-surface border border-glass-border rounded-2xl px-4 py-3 text-foreground"
            style={{ minHeight: 110 }}
          />
        </View>

        {/* ── Audience ────────────────────────────────────────────── */}
        <GlassCard testID="campaign-audience-card" style={{ paddingVertical: 16 }}>
          <View className="gap-4">
            <Text
              className="text-foreground font-body-semibold"
              style={{ fontSize: 15 }}
            >
              {t("campaigns.compose.audience")}
            </Text>

            {/* everyone toggle */}
            <SwitchRow
              testID="campaign-axis-everyone"
              label={t("campaigns.compose.axes.everyone")}
              checked={axes.everyone}
              onToggle={toggleEveryone}
              a11yLabel={t("campaigns.a11y.axisToggle", {
                axis: t("campaigns.compose.axes.everyone"),
              })}
            />

            {!axes.everyone ? (
              <View className="gap-4">
                {/* packageState — 4 chips */}
                <View testID="campaign-axis-packageState" className="gap-2">
                  <Text
                    className="text-muted font-body-medium"
                    style={{ fontSize: 13 }}
                  >
                    {t("campaigns.compose.axes.packageState")}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {PACKAGE_STATES.map((value) => {
                      const selected = axes.packageState === value;
                      return (
                        <Pressable
                          key={value}
                          testID={`campaign-packagestate-${value}`}
                          onPress={() => selectPackageState(value)}
                          android_ripple={null}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={`px-3 py-2 rounded-xl border active:opacity-70 ${
                            selected
                              ? "bg-accent border-accent"
                              : "bg-surface border-glass-border"
                          }`}
                        >
                          <Text
                            className={`font-body-medium ${
                              selected ? "text-white" : "text-foreground"
                            }`}
                            style={{ fontSize: 13 }}
                          >
                            {t(`campaigns.compose.packageState.${value}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* classType — picker list */}
                <View testID="campaign-axis-classType" className="gap-2">
                  <Text
                    className="text-muted font-body-medium"
                    style={{ fontSize: 13 }}
                  >
                    {t("campaigns.compose.axes.classType")}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {(classTypesQuery.data?.classTypes ?? []).map((ct) => {
                      const selected = axes.classTypeId === ct.id;
                      return (
                        <Pressable
                          key={ct.id}
                          testID={`campaign-classtype-${ct.id}`}
                          onPress={() => selectClassType(ct.id)}
                          android_ripple={null}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={`px-3 py-2 rounded-xl border active:opacity-70 ${
                            selected
                              ? "bg-accent border-accent"
                              : "bg-surface border-glass-border"
                          }`}
                        >
                          <Text
                            className={`font-body-medium ${
                              selected ? "text-white" : "text-foreground"
                            }`}
                            style={{ fontSize: 13 }}
                          >
                            {ct.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* expiringSoon — switch + N */}
                <View className="gap-2">
                  <SwitchRow
                    testID="campaign-axis-expiringSoon"
                    label={t("campaigns.compose.axes.expiringSoon")}
                    checked={axes.expiringSoonDays !== undefined}
                    onToggle={toggleExpiringSoon}
                    a11yLabel={t("campaigns.a11y.axisToggle", {
                      axis: t("campaigns.compose.axes.expiringSoon"),
                    })}
                  />
                  {axes.expiringSoonDays !== undefined ? (
                    <DaysInput
                      testID="campaign-expiringSoon-days"
                      label={t("campaigns.compose.daysLabel")}
                      value={axes.expiringSoonDays}
                      fallback={DEFAULT_EXPIRING_SOON}
                      onCommit={(days) =>
                        setAxes((a) => ({ ...a, expiringSoonDays: days }))
                      }
                      tokens={tokens}
                    />
                  ) : null}
                </View>

                {/* lapsed — switch + N (mutually exclusive with idlePackage) */}
                <View className="gap-2">
                  <SwitchRow
                    testID="campaign-axis-lapsed"
                    label={t("campaigns.compose.axes.lapsed")}
                    checked={axes.lapsedDays !== undefined}
                    onToggle={toggleLapsed}
                    a11yLabel={t("campaigns.a11y.axisToggle", {
                      axis: t("campaigns.compose.axes.lapsed"),
                    })}
                  />
                  {axes.lapsedDays !== undefined ? (
                    <DaysInput
                      testID="campaign-lapsed-days"
                      label={t("campaigns.compose.daysLabel")}
                      value={axes.lapsedDays}
                      fallback={DEFAULT_LAPSED}
                      onCommit={(days) =>
                        setAxes((a) => ({ ...a, lapsedDays: days }))
                      }
                      tokens={tokens}
                    />
                  ) : null}
                </View>

                {/* idlePackage — switch + N (mutually exclusive with lapsed) */}
                <View className="gap-2">
                  <SwitchRow
                    testID="campaign-axis-idlePackage"
                    label={t("campaigns.compose.axes.idlePackage")}
                    checked={axes.idlePackageDays !== undefined}
                    onToggle={toggleIdlePackage}
                    a11yLabel={t("campaigns.a11y.axisToggle", {
                      axis: t("campaigns.compose.axes.idlePackage"),
                    })}
                  />
                  {axes.idlePackageDays !== undefined ? (
                    <DaysInput
                      testID="campaign-idlePackage-days"
                      label={t("campaigns.compose.daysLabel")}
                      value={axes.idlePackageDays}
                      fallback={DEFAULT_IDLE}
                      onCommit={(days) =>
                        setAxes((a) => ({ ...a, idlePackageDays: days }))
                      }
                      tokens={tokens}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </GlassCard>

        {/* ── Live reach preview ──────────────────────────────────── */}
        <View testID="campaign-preview-count" className="gap-1">
          <View className="flex-row items-center gap-2">
            <Icon name="users" size={16} color={tokens.muted} />
            {spec === null ? (
              <Text className="text-muted" style={{ fontSize: 15 }}>
                {t("campaigns.compose.previewEmpty")}
              </Text>
            ) : previewQuery.isError ? (
              <Text className="text-danger" style={{ fontSize: 15 }}>
                {t("campaigns.compose.previewError")}
              </Text>
            ) : previewQuery.isPending || previewQuery.isFetching ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={tokens.muted} />
                <Text className="text-muted" style={{ fontSize: 15 }}>
                  {t("campaigns.compose.previewLoading")}
                </Text>
              </View>
            ) : (
              <Text
                className="text-foreground font-body-semibold"
                style={{ fontSize: 15 }}
              >
                {t("campaigns.compose.previewCount", { count: previewCount })}
              </Text>
            )}
          </View>
          {/* Reach is the matching-audience size; clients who opted out of
              promotions are counted here but won't actually be messaged. */}
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {t("campaigns.compose.reachNote")}
          </Text>
        </View>

        {/* ── Schedule ────────────────────────────────────────────── */}
        <View className="gap-2">
          <Text className="text-muted font-body-medium" style={{ fontSize: 13 }}>
            {t("campaigns.compose.scheduledFor")}
          </Text>
          <DateTimePicker
            testID="campaign-schedule"
            mode="datetime"
            value={null}
            minimumDate={new Date()}
            placeholder={t("campaigns.compose.schedule")}
            onChange={(date) => requestSend({ scheduledFor: date.toISOString() })}
            disabled={!canSubmit}
          />
        </View>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <View className="gap-3">
          <Button
            testID="campaign-save-draft"
            variant="secondary"
            disabled={!canSubmit}
            onPress={() => submit({})}
          >
            {t("campaigns.compose.saveDraft")}
          </Button>
          <Button
            testID="campaign-send-now"
            disabled={!canSubmit}
            onPress={() => requestSend({ sendNow: true })}
          >
            {t("campaigns.compose.sendNow")}
          </Button>
          {createMutation.isError && pendingSend === null ? (
            <Text className="text-danger" style={{ fontSize: 13 }}>
              {t("campaigns.compose.saveError")}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Confirm before messaging the whole audience (send-now or scheduled). */}
      <ConfirmSheet
        open={pendingSend !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSend(null);
        }}
        title={
          pendingSend?.sendNow
            ? t("campaigns.compose.confirmSendTitle")
            : t("campaigns.compose.confirmScheduleTitle")
        }
        message={t("campaigns.compose.confirmMessage", { count: previewCount })}
        confirmLabel={
          pendingSend?.sendNow
            ? t("campaigns.compose.sendNow")
            : t("campaigns.compose.schedule")
        }
        tone="primary"
        loading={createMutation.isPending}
        errorMessage={
          createMutation.isError ? t("campaigns.compose.saveError") : null
        }
        testID="campaign-confirm-send"
        onConfirm={() => {
          if (pendingSend) submit(pendingSend);
        }}
      />
    </ScreenContainerRaw>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────

function SwitchRow({
  testID,
  label,
  checked,
  onToggle,
  a11yLabel,
}: {
  testID: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  a11yLabel: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      android_ripple={null}
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={a11yLabel}
      className="flex-row items-center justify-between active:opacity-70"
    >
      <Text
        className="text-foreground font-body-medium flex-1"
        style={{ fontSize: 14 }}
      >
        {label}
      </Text>
      <View
        className={`w-6 h-6 rounded-lg items-center justify-center border ${
          checked ? "bg-accent border-accent" : "bg-surface border-glass-border"
        }`}
      >
        {checked ? <Icon name="check" size={14} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}

function DaysInput({
  testID,
  label,
  value,
  fallback,
  onCommit,
  tokens,
}: {
  testID: string;
  label: string;
  value: number;
  fallback: number;
  onCommit: (clamped: number) => void;
  tokens: ReturnType<typeof useThemeTokens>;
}) {
  const [text, setText] = useState(String(value));
  // parseDays may clamp/replace the raw text (e.g. "0" or "abc" -> the
  // fallback). Commit the CLAMPED number and snap the visible field to it, so
  // what's shown can never diverge from the spec that drives preview + send.
  function commit() {
    const clamped = parseDays(text, fallback);
    onCommit(clamped);
    setText(String(clamped));
  }
  return (
    <View className="flex-row items-center gap-3 pl-1">
      <Text className="text-muted" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onEndEditing={commit}
        keyboardType="number-pad"
        placeholderTextColor={tokens.faint}
        className="bg-surface border border-glass-border rounded-xl px-3 text-foreground"
        style={{ height: 40, width: 80 }}
      />
    </View>
  );
}
