/**
 * Campaign compose — the body of the "new campaign" bottom sheet.
 *
 * Matches the app's other "add" forms (assign-package, rooms): flat
 * SectionLabel + Input + selectable chips inside an <AppSheet>, NOT a full page
 * with cards. The parent (campaigns list) owns the AppSheet + the confirm sheet
 * + the create mutation; this component owns the form state and the live reach
 * preview, and calls onSave / onRequestSend with the assembled payload.
 *
 * Audience invariants (mirrored from the schema so we never build a rejected
 * spec): `everyone` is exclusive with the narrowing axes; `lapsed` and
 * `idlePackage` are mutually exclusive.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { CampaignAudienceSpec } from "@baza/types";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { useSpinDelay } from "@/lib/use-spin-delay";
import { campaignsQueries } from "@/lib/queries/campaigns-queries-factory";
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

/** Reverse of toSpec — rebuild the UI axis state from a stored audienceSpec
 *  (used to pre-fill the form when editing an existing campaign). */
function specToAxes(spec: CampaignAudienceSpec | undefined | null): AxesState {
  if (!spec) return { everyone: false };
  if (spec.everyone) return { everyone: true };
  return {
    everyone: false,
    packageState: spec.packageState,
    classTypeId: spec.classTypeId,
    expiringSoonDays: spec.expiringSoonDays,
    lapsedDays: spec.lapsedDays,
    idlePackageDays: spec.idlePackageDays,
  };
}

function parseDays(text: string, fallback: number): number {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 365);
}

export type ComposePayload = {
  title: string;
  body: string;
  audienceSpec: CampaignAudienceSpec;
  scheduledFor?: string;
  sendNow?: boolean;
};

/** Pre-fill values when editing an existing campaign. */
export type ComposeInitial = {
  title: string;
  body: string;
  audienceSpec: CampaignAudienceSpec;
  scheduledFor: string | null;
};

export function CampaignComposeSheetContent({
  mode = "create",
  initial,
  busy,
  errorMessage,
  onSaveDraft,
  onRequestSend,
  onSaveEdit,
  onViewClients,
}: {
  /** "create" shows Save-draft + Send/Schedule; "edit" shows a single Save. */
  mode?: "create" | "edit";
  /** Pre-fill values (edit mode). */
  initial?: ComposeInitial;
  /** True while the mutation is in flight (disables actions). */
  busy: boolean;
  /** Inline error from the last failed submit, or null. */
  errorMessage: string | null;
  onSaveDraft: (payload: ComposePayload) => void;
  /** Send-now / scheduled — the parent shows a confirm sheet before dispatching. */
  onRequestSend: (payload: ComposePayload, reach: number) => void;
  /** Save edits to an existing campaign (edit mode). */
  onSaveEdit?: (payload: ComposePayload) => void;
  /** Open the audience-clients sheet for the current spec. The PARENT owns that
   *  sheet (mounted as a sibling of the compose sheet) so the two stack cleanly
   *  instead of nesting — a nested BottomSheetModal wedges + flickers. */
  onViewClients?: (spec: CampaignAudienceSpec) => void;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [axes, setAxes] = useState<AxesState>(() => specToAxes(initial?.audienceSpec));
  // The schedule field is a VALUE: picking a time just records it here; the
  // action buttons decide what to do with it (no submit on pick).
  const [scheduledFor, setScheduledFor] = useState<Date | null>(
    initial?.scheduledFor ? new Date(initial.scheduledFor) : null,
  );

  const spec = toSpec(axes);
  const previewQuery = useQuery(campaignsQueries.preview(spec));
  const classTypesQuery = useQuery(trainingsQueries.classTypes());
  const previewCount = previewQuery.data?.count ?? 0;
  const previewLoading =
    spec !== null && (previewQuery.isPending || previewQuery.isFetching);
  // For background refetches (we already have a count to keep showing), delay
  // the spinner so it doesn't flash. For the FIRST load with no count yet, show
  // it immediately — otherwise the UI would render a misleading "Reach: 0".
  const delayedSpinner = useSpinDelay(previewLoading, {
    delay: 500,
    minDuration: 300,
  });
  const showReachSpinner =
    previewLoading && (delayedSpinner || previewQuery.data === undefined);

  const canSubmit =
    title.trim().length > 0 && body.trim().length > 0 && spec !== null && !busy;

  function buildPayload(extra: { sendNow?: boolean; scheduledFor?: string }): ComposePayload | null {
    if (!canSubmit || spec === null) return null;
    return { title, body, audienceSpec: spec, ...extra };
  }

  // ── Axis togglers — enforce the schema's exclusivity invariants ──
  function toggleEveryone() {
    setAxes((a) => (a.everyone ? { everyone: false } : { everyone: true }));
  }
  function selectPackageState(value: PackageState) {
    setAxes((a) => ({ ...a, packageState: a.packageState === value ? undefined : value }));
  }
  function selectClassType(id: string) {
    setAxes((a) => ({ ...a, classTypeId: a.classTypeId === id ? undefined : id }));
  }
  function toggleExpiringSoon() {
    setAxes((a) => ({
      ...a,
      expiringSoonDays: a.expiringSoonDays === undefined ? DEFAULT_EXPIRING_SOON : undefined,
    }));
  }
  function toggleLapsed() {
    setAxes((a) =>
      a.lapsedDays === undefined
        ? { ...a, lapsedDays: DEFAULT_LAPSED, idlePackageDays: undefined }
        : { ...a, lapsedDays: undefined },
    );
  }
  function toggleIdlePackage() {
    setAxes((a) =>
      a.idlePackageDays === undefined
        ? { ...a, idlePackageDays: DEFAULT_IDLE, lapsedDays: undefined }
        : { ...a, idlePackageDays: undefined },
    );
  }

  return (
    <View className="flex-col gap-5">
      <Text
        className="text-foreground font-body-bold"
        style={{ fontSize: 20, letterSpacing: -0.3 }}
      >
        {mode === "edit"
          ? t("campaigns.detail.editTitle")
          : t("campaigns.compose.title")}
      </Text>

      {/* Message */}
      <View className="gap-2">
        <SectionLabel>{t("campaigns.compose.titleLabel")}</SectionLabel>
        <Input
          testID="campaign-title-input"
          value={title}
          onChangeText={setTitle}
          placeholder={t("campaigns.compose.titlePlaceholder")}
        />
      </View>
      <View className="gap-2">
        <SectionLabel>{t("campaigns.compose.bodyLabel")}</SectionLabel>
        <Input
          testID="campaign-body-input"
          value={body}
          onChangeText={setBody}
          placeholder={t("campaigns.compose.bodyPlaceholder")}
          multiline
          style={{ minHeight: 100 }}
        />
      </View>

      {/* Audience — flat, no card */}
      <View className="gap-4">
        <SectionLabel>{t("campaigns.compose.audience")}</SectionLabel>

        <SwitchRow
          testID="campaign-axis-everyone"
          label={t("campaigns.compose.axes.everyone")}
          checked={axes.everyone}
          onToggle={toggleEveryone}
          a11yLabel={t("campaigns.a11y.axisToggle", { axis: t("campaigns.compose.axes.everyone") })}
        />

        {!axes.everyone ? (
          <View className="gap-4">
            <ChipGroup
              testID="campaign-axis-packageState"
              label={t("campaigns.compose.axes.packageState")}
              options={PACKAGE_STATES.map((v) => ({
                id: v,
                label: t(`campaigns.compose.packageState.${v}`),
                testID: `campaign-packagestate-${v}`,
              }))}
              selectedId={axes.packageState}
              onSelect={(v) => selectPackageState(v as PackageState)}
            />
            <ChipGroup
              testID="campaign-axis-classType"
              label={t("campaigns.compose.axes.classType")}
              options={(classTypesQuery.data?.classTypes ?? []).map((ct) => ({
                id: ct.id,
                label: ct.name,
                testID: `campaign-classtype-${ct.id}`,
              }))}
              selectedId={axes.classTypeId}
              onSelect={selectClassType}
            />

            <View className="gap-2">
              <SwitchRow
                testID="campaign-axis-expiringSoon"
                label={t("campaigns.compose.axes.expiringSoon")}
                checked={axes.expiringSoonDays !== undefined}
                onToggle={toggleExpiringSoon}
                a11yLabel={t("campaigns.a11y.axisToggle", { axis: t("campaigns.compose.axes.expiringSoon") })}
              />
              {axes.expiringSoonDays !== undefined ? (
                <DaysInput
                  testID="campaign-expiringSoon-days"
                  label={t("campaigns.compose.daysLabel")}
                  value={axes.expiringSoonDays}
                  fallback={DEFAULT_EXPIRING_SOON}
                  onCommit={(d) => setAxes((a) => ({ ...a, expiringSoonDays: d }))}
                  tokens={tokens}
                />
              ) : null}
            </View>

            <View className="gap-2">
              <SwitchRow
                testID="campaign-axis-lapsed"
                label={t("campaigns.compose.axes.lapsed")}
                checked={axes.lapsedDays !== undefined}
                onToggle={toggleLapsed}
                a11yLabel={t("campaigns.a11y.axisToggle", { axis: t("campaigns.compose.axes.lapsed") })}
              />
              {axes.lapsedDays !== undefined ? (
                <DaysInput
                  testID="campaign-lapsed-days"
                  label={t("campaigns.compose.daysLabel")}
                  value={axes.lapsedDays}
                  fallback={DEFAULT_LAPSED}
                  onCommit={(d) => setAxes((a) => ({ ...a, lapsedDays: d }))}
                  tokens={tokens}
                />
              ) : null}
            </View>

            <View className="gap-2">
              <SwitchRow
                testID="campaign-axis-idlePackage"
                label={t("campaigns.compose.axes.idlePackage")}
                checked={axes.idlePackageDays !== undefined}
                onToggle={toggleIdlePackage}
                a11yLabel={t("campaigns.a11y.axisToggle", { axis: t("campaigns.compose.axes.idlePackage") })}
              />
              {axes.idlePackageDays !== undefined ? (
                <DaysInput
                  testID="campaign-idlePackage-days"
                  label={t("campaigns.compose.daysLabel")}
                  value={axes.idlePackageDays}
                  fallback={DEFAULT_IDLE}
                  onCommit={(d) => setAxes((a) => ({ ...a, idlePackageDays: d }))}
                  tokens={tokens}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* Live reach */}
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
          ) : showReachSpinner ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={tokens.muted} />
              <Text className="text-muted" style={{ fontSize: 15 }}>
                {t("campaigns.compose.previewLoading")}
              </Text>
            </View>
          ) : (
            <Text className="text-foreground font-body-semibold" style={{ fontSize: 15 }}>
              {t("campaigns.compose.previewCount", { count: previewCount })}
            </Text>
          )}
        </View>
        <Text className="text-muted" style={{ fontSize: 12 }}>
          {t("campaigns.compose.reachNote")}
        </Text>
        {spec !== null && previewQuery.data && previewCount > 0 && onViewClients ? (
          <Pressable
            testID="campaign-view-clients"
            onPress={() => onViewClients(spec)}
            android_ripple={null}
            className="active:opacity-60 self-start pt-1"
            accessibilityRole="button"
          >
            <Text className="text-accent font-body-medium" style={{ fontSize: 13 }}>
              {t("campaigns.clients.viewProjected", { count: previewCount })}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Schedule — picking a time only records the value; the action button
          below turns into "Schedule for {time}". */}
      <View className="gap-2">
        <SectionLabel>{t("campaigns.compose.scheduledFor")}</SectionLabel>
        <DateTimePicker
          testID="campaign-schedule"
          mode="datetime"
          value={scheduledFor}
          minimumDate={new Date()}
          placeholder={t("campaigns.compose.schedule")}
          onChange={setScheduledFor}
          disabled={busy}
        />
      </View>

      {/* Actions */}
      <View className="gap-3">
        {mode === "edit" ? (
          <Button
            testID="campaign-save-edit"
            disabled={!canSubmit}
            onPress={() => {
              const p = buildPayload(
                scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {},
              );
              if (p) onSaveEdit?.(p);
            }}
          >
            {t("campaigns.detail.saveEdit")}
          </Button>
        ) : (
          <>
            <Button
              testID="campaign-save-draft"
              variant="secondary"
              disabled={!canSubmit}
              onPress={() => {
                const p = buildPayload({});
                if (p) onSaveDraft(p);
              }}
            >
              {t("campaigns.compose.saveDraft")}
            </Button>
            {scheduledFor ? (
              <Button
                testID="campaign-schedule-send"
                disabled={!canSubmit}
                onPress={() => {
                  const p = buildPayload({ scheduledFor: scheduledFor.toISOString() });
                  if (p) onRequestSend(p, previewCount);
                }}
              >
                {t("campaigns.compose.scheduleFor", {
                  when: scheduledFor.toLocaleString(getDateLocale()),
                })}
              </Button>
            ) : (
              <Button
                testID="campaign-send-now"
                disabled={!canSubmit}
                onPress={() => {
                  const p = buildPayload({ sendNow: true });
                  if (p) onRequestSend(p, previewCount);
                }}
              >
                {t("campaigns.compose.sendNow")}
              </Button>
            )}
          </>
        )}
        {errorMessage ? (
          <Text className="text-danger" style={{ fontSize: 13 }}>
            {errorMessage}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────

function ChipGroup({
  testID,
  label,
  options,
  selectedId,
  onSelect,
}: {
  testID: string;
  label: string;
  options: { id: string; label: string; testID: string }[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View testID={testID} className="gap-2">
      <Text className="text-muted font-body-medium" style={{ fontSize: 13 }}>
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const selected = selectedId === o.id;
          return (
            <Pressable
              key={o.id}
              testID={o.testID}
              onPress={() => onSelect(o.id)}
              android_ripple={null}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`px-3 py-2 rounded-xl border active:opacity-70 ${
                selected ? "bg-accent border-accent" : "bg-surface border-glass-border"
              }`}
            >
              <Text
                className={`font-body-medium ${selected ? "text-white" : "text-foreground"}`}
                style={{ fontSize: 13 }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
      <Text className="text-foreground font-body-medium flex-1" style={{ fontSize: 14 }}>
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
