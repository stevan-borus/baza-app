/**
 * Shared compose sheet for creating a TrainerNote — used by both the trainer
 * notes feed and the admin notes feed.
 *
 * Layout (unchanged from the original trainer screen): the sheet shows ONLY a
 * client trigger row, a large note input, a subtle session trigger row, and
 * Save. Each picker opens its own stacked sub-sheet so the compose sheet
 * itself stays short and the note text is the dominant element.
 *
 * `clientProfileId`:
 *   - `null`  → free pick: the client trigger + picker are shown (trainer feed,
 *               admin feed).
 *   - string  → the client is fixed (the host screen is already client-scoped);
 *               the client trigger/picker are hidden entirely. Reserved for a
 *               per-client compose surface (option A).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SessionPicker } from "@/components/ui/session-picker";
import { ClientPicker } from "@/components/ui/client-picker";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { trainerNotesQueries } from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

// ─── ComposeFieldTrigger ─────────────────────────────────────────────────────

/**
 * Single row used as a trigger inside the compose sheet for the client and
 * session fields. Empty state shows a placeholder + chevron; filled state
 * shows the picked label and an × to clear without re-opening the picker.
 */
function ComposeFieldTrigger({
  icon,
  placeholder,
  label,
  hint,
  onPress,
  onClear,
  emphasis = "default",
  testID,
}: {
  icon?: "user" | "link";
  placeholder: string;
  label: string | null;
  hint?: string | null;
  onPress: () => void;
  onClear?: () => void;
  /**
   * "default" — required field (Klijent). Borders + glass surface always.
   * "subtle"  — optional field (session). Flat text-link look when empty,
   *             promotes to glass surface only when filled.
   */
  emphasis?: "default" | "subtle";
  testID?: string;
}) {
  const tokens = useThemeTokens();
  const isFilled = !!label;
  const showSurface = emphasis === "default" || isFilled;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? placeholder}
      className="active:opacity-70"
    >
      <View
        className="flex-row items-center"
        style={{
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: showSurface ? 14 : 4,
          borderRadius: 12,
          backgroundColor: showSurface ? tokens.glass : "transparent",
          borderWidth: showSurface ? 1 : 0,
          borderColor: showSurface ? tokens.glassBorder : "transparent",
        }}
      >
        {icon ? (
          <Feather
            name={icon}
            size={14}
            color={isFilled ? tokens.accent : tokens.muted}
          />
        ) : null}
        <View className="flex-1 flex-col" style={{ gap: 2 }}>
          {isFilled ? (
            <>
              <Text
                className="font-body-semibold text-foreground"
                style={{ fontSize: 14 }}
                numberOfLines={1}
              >
                {label}
              </Text>
              {hint ? (
                <Text
                  className="text-muted"
                  style={{ fontSize: 12 }}
                  numberOfLines={1}
                >
                  {hint}
                </Text>
              ) : null}
            </>
          ) : (
            <Text
              className={
                emphasis === "subtle"
                  ? "text-muted font-body-medium"
                  : "text-faint font-body-medium"
              }
              style={{ fontSize: 14 }}
              numberOfLines={1}
            >
              {placeholder}
            </Text>
          )}
        </View>
        {isFilled && onClear ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClear();
            }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Feather name="x" size={14} color={tokens.muted} />
          </Pressable>
        ) : (
          <Feather name="chevron-down" size={14} color={tokens.muted} />
        )}
      </View>
    </Pressable>
  );
}

// ─── TrainerNoteComposeSheet ─────────────────────────────────────────────────

export function TrainerNoteComposeSheet({
  open,
  onOpenChange,
  clientProfileId = null,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed client (hides the client picker) or null for free pick. */
  clientProfileId?: string | null;
  /** Fired after a successful create — host can scroll its feed to top. */
  onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dateLocale = getDateLocale();
  const clientFixed = clientProfileId !== null;

  const [form, setForm] = useState<{
    sessionId: string;
    clientProfileId: string;
    clientLabel: string;
    note: string;
  }>({ sessionId: "", clientProfileId: "", clientLabel: "", note: "" });
  const [showComposeClientPicker, setShowComposeClientPicker] = useState(false);
  const [showComposeSessionPicker, setShowComposeSessionPicker] = useState(false);

  const sessionsQuery = useQuery(sessionsQueries.list());
  // When the compose-sheet session is picked, fetch its detail so we can
  // scope the client picker to the people actually booked into that class.
  // Without a session the user gets the full searchable client list instead.
  const composeSessionDetailQuery = useQuery({
    ...sessionsQueries.byId(form.sessionId),
    enabled: !!form.sessionId,
  });
  const scopedComposeClients = useMemo(() => {
    const bookings = composeSessionDetailQuery.data?.session.bookings ?? [];
    return bookings.map((b) => ({
      id: b.clientProfileId,
      user: {
        id: b.client.id,
        fullName: b.client.fullName,
        email: b.client.email,
      },
    }));
  }, [composeSessionDetailQuery.data]);

  // The effective client id submitted: the fixed prop when client-locked,
  // otherwise whatever the picker set in local form state.
  const effectiveClientProfileId = clientFixed
    ? (clientProfileId as string)
    : form.clientProfileId;

  const createMutation = useMutation({
    ...trainerNotesQueries.create(),
    onSuccess: async () => {
      onOpenChange(false);
      setForm({ sessionId: "", clientProfileId: "", clientLabel: "", note: "" });
      // Wait for the refetched page to land in cache (refetch, not just
      // invalidate — invalidate resolves on cache-mark, not on data arrival)
      // so the host's onCreated scroll-to-top sees the new row.
      await queryClient.refetchQueries({ queryKey: ["trainer-notes"] });
      onCreated?.();
    },
  });

  const composeSessionLabel = useMemo(() => {
    if (!form.sessionId) return null;
    const s = sessionsQuery.data?.sessions.find((x) => x.id === form.sessionId);
    return s?.classType?.name ?? t("trainer.clients.sessionName");
  }, [form.sessionId, sessionsQuery.data, t]);
  const composeSessionHint = useMemo(() => {
    if (!form.sessionId) return null;
    const s = sessionsQuery.data?.sessions.find((x) => x.id === form.sessionId);
    if (!s) return null;
    return new Date(s.startsAt).toLocaleDateString(dateLocale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [form.sessionId, sessionsQuery.data, dateLocale]);

  function clearSessionAndMaybeClient() {
    setForm((f) => ({
      ...f,
      sessionId: "",
      // If the client was picked from the now-irrelevant scoped list, clear
      // them too so we don't submit a stale pairing. (No-op when client-locked.)
      clientProfileId:
        !clientFixed && scopedComposeClients.some((c) => c.id === f.clientProfileId)
          ? ""
          : f.clientProfileId,
      clientLabel:
        !clientFixed && scopedComposeClients.some((c) => c.id === f.clientProfileId)
          ? ""
          : f.clientLabel,
    }));
  }

  return (
    <>
      <AppSheet open={open} onOpenChange={onOpenChange}>
        <View className="flex-col gap-4 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("trainer.notes.sheetTitle")}
          </Text>

          {/* CLIENT trigger (required) — hidden when the client is fixed. */}
          {clientFixed ? null : (
            <ComposeFieldTrigger
              testID="note-client-trigger"
              icon="user"
              placeholder={t("trainer.notes.pickClientCta")}
              label={form.clientProfileId ? form.clientLabel : null}
              onPress={() => setShowComposeClientPicker(true)}
              onClear={() => {
                setForm((f) => ({
                  ...f,
                  clientProfileId: "",
                  clientLabel: "",
                }));
              }}
            />
          )}

          {/* NOTE TEXT (required) — the dominant field. */}
          <Input
            testID="note-text-input"
            placeholder={t("trainer.notes.placeholder")}
            multiline
            value={form.note}
            onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
            style={{ minHeight: 120 }}
          />

          {/* SESSION trigger (optional, subtle) */}
          <ComposeFieldTrigger
            testID="note-session-trigger"
            icon="link"
            emphasis="subtle"
            placeholder={t("trainer.notes.linkSessionOptional")}
            label={composeSessionLabel}
            hint={composeSessionHint}
            onPress={() => setShowComposeSessionPicker(true)}
            onClear={clearSessionAndMaybeClient}
          />

          <Button
            testID="note-save-button"
            disabled={
              createMutation.isPending ||
              !effectiveClientProfileId ||
              !form.note
            }
            onPress={() =>
              createMutation.mutate({
                clientProfileId: effectiveClientProfileId,
                note: form.note,
                ...(form.sessionId ? { sessionId: form.sessionId } : {}),
              })
            }
          >
            {t("admin.clients.save")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("trainer.notes.saveError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* ── Compose client picker sub-sheet (free-pick only) ── */}
      {clientFixed ? null : (
        <AppSheet
          open={showComposeClientPicker}
          onOpenChange={setShowComposeClientPicker}
        >
          <View className="flex-col gap-4 pb-5">
            <View className="flex-row items-center justify-between">
              <Text
                className="text-foreground font-body-bold"
                style={{ fontSize: 18, letterSpacing: -0.3 }}
              >
                {t("trainer.notes.pickClientCta")}
              </Text>
              <Pressable
                onPress={() => setShowComposeClientPicker(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                className="active:opacity-60"
              >
                <Feather name="x" size={20} color="#888" />
              </Pressable>
            </View>
            {form.sessionId ? (
              <ClientPicker
                mode="scoped"
                testID="note-client-picker-scoped"
                optionTestIDPrefix="note-client-option"
                clients={scopedComposeClients}
                selectedId={form.clientProfileId || null}
                onSelect={(id) => {
                  // Toggle: same row clears, different row picks.
                  if (id === form.clientProfileId) {
                    setForm((f) => ({
                      ...f,
                      clientProfileId: "",
                      clientLabel: "",
                    }));
                  } else {
                    const picked = scopedComposeClients.find((c) => c.id === id);
                    setForm((f) => ({
                      ...f,
                      clientProfileId: id,
                      clientLabel: picked?.user.fullName ?? "",
                    }));
                    setShowComposeClientPicker(false);
                  }
                }}
                emptyText={t("trainer.notes.noBookedClients")}
              />
            ) : (
              <ClientPicker
                testID="note-client-picker"
                optionTestIDPrefix="note-client-option"
                selectedId={form.clientProfileId || null}
                onSelect={(id) => {
                  if (id === form.clientProfileId) {
                    setForm((f) => ({
                      ...f,
                      clientProfileId: "",
                      clientLabel: "",
                    }));
                    return;
                  }
                  const cached = queryClient.getQueryData<{
                    pages: { clients: { id: string; user: { fullName: string } }[] }[];
                  }>(["clients", "list", { q: "", take: 20 }]);
                  const found = cached?.pages
                    .flatMap((p) => p.clients)
                    .find((c) => c.id === id);
                  setForm((f) => ({
                    ...f,
                    clientProfileId: id,
                    clientLabel: found?.user.fullName ?? "",
                  }));
                  setShowComposeClientPicker(false);
                }}
              />
            )}
          </View>
        </AppSheet>
      )}

      {/* ── Compose session picker sub-sheet ── */}
      <AppSheet
        open={showComposeSessionPicker}
        onOpenChange={setShowComposeSessionPicker}
      >
        <View className="flex-col gap-4 pb-5">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 18, letterSpacing: -0.3 }}
            >
              {t("trainer.notes.linkSessionOptional")}
            </Text>
            <Pressable
              onPress={() => setShowComposeSessionPicker(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="active:opacity-60"
            >
              <Feather name="x" size={20} color="#888" />
            </Pressable>
          </View>
          <SessionPicker
            testID="note-session-picker"
            optionTestIDPrefix="note-session-option"
            sessions={sessionsQuery.data?.sessions ?? []}
            selectedId={form.sessionId || null}
            onSelect={(id) => {
              // Toggle: tapping same session clears it; different switches
              // and may invalidate the client (scoped roster changes).
              if (id === form.sessionId) {
                clearSessionAndMaybeClient();
                return;
              }
              setForm((f) => ({
                ...f,
                sessionId: id,
                // Switching session invalidates a free-pick client (the
                // scoped roster changes). A fixed client is never cleared.
                clientProfileId: clientFixed ? f.clientProfileId : "",
                clientLabel: clientFixed ? f.clientLabel : "",
              }));
              setShowComposeSessionPicker(false);
            }}
            scheduledOnly
          />
        </View>
      </AppSheet>
    </>
  );
}
