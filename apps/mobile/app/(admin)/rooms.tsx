/**
 * Admin Settings — Rooms management screen.
 * Design references (from docs/inspiration/):
 * - Linear Mobile ios Apr 2026/ — glass list rows with icon + meta
 * - Apple Fitness ios Feb 2026/ — icon-accented rows
 *
 * Each room is rendered as a GlassCard row:
 *   door icon  |  name  |  capacity badge  |  chevron
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { SectionLabel } from "@/components/ui/typography";
import { ACCENT_LIGHT } from "@/components/ui/tokens";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";

export default function AdminSettingsRooms() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({ name: "", capacity: "" });
  const [editForm, setEditForm] = useState({ name: "", capacity: "" });

  const roomsQuery = useQuery(roomsQueries.list());

  const createMutation = useMutation({
    ...roomsQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setShowCreate(false);
      setForm({ name: "", capacity: "" });
    },
  });

  const updateMutation = useMutation({
    ...roomsQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    ...roomsQueries.delete(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setConfirmDelete(false);
      setEditingId(null);
    },
  });

  function openEdit(room: { id: string; name: string; capacity: number }) {
    setEditForm({ name: room.name, capacity: String(room.capacity) });
    setEditingId(room.id);
  }

  const rooms = roomsQuery.data?.rooms ?? [];

  return (
    <ScreenContainerRaw
      title={t("admin.manage.rooms")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("admin.manage.sheetNewRoom")}
          testID="admin-new-room-button"
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
      >
      {/* Section label */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350 }}
      >
        <View className="flex-row items-center justify-between mb-1">
          <SectionLabel>
            {t("admin.manage.rooms")} · {rooms.length}
          </SectionLabel>
        </View>
      </MotiView>

      {/* Room list */}
      {rooms.map((room, idx) => (
        <MotiView
          key={room.id}
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: idx * 60 }}
        >
          <Pressable
            testID={`room-row-${room.id}`}
            onPress={() => openEdit(room)}
            android_ripple={null}
            className="active:opacity-70"
          >
            <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
              <View className="flex-row items-center px-4 py-3.5 gap-3.5">
                {/* Name */}
                <Text
                  className="text-foreground font-body-medium flex-1"
                  style={{ fontSize: 16 }}
                  numberOfLines={1}
                >
                  {room.name}
                </Text>

                {/* Capacity badge */}
                <View className="flex-row items-center gap-1.5">
                  <FontAwesome name="users" size={11} color="#a1a1aa" />
                  <Text className="text-muted" style={{ fontSize: 13 }}>
                    {room.capacity}
                  </Text>
                  <FontAwesome name="chevron-right" size={11} color="#52525b" />
                </View>
              </View>
            </GlassCard>
          </Pressable>
        </MotiView>
      ))}

      {rooms.length === 0 && !roomsQuery.isLoading && (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 400, delay: 80 }}
        >
          <View className="items-center py-12">
            <FontAwesome name="map-marker" size={32} color="#3f3f46" />
            <Text className="text-muted mt-3" style={{ fontSize: 14 }}>
              {t("admin.manage.rooms")}
            </Text>
          </View>
        </MotiView>
      )}

      {/* Create sheet */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetNewRoom")}
          </Text>
          <Input
            testID="room-name-input"
            placeholder={t("admin.manage.placeholderName")}
            value={form.name}
            onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
          />
          <Input
            testID="room-capacity-input"
            placeholder={t("admin.manage.placeholderCapacity")}
            keyboardType="numeric"
            value={form.capacity}
            onChangeText={(v) => setForm((s) => ({ ...s, capacity: v }))}
          />
          <Button
            testID="room-create-submit"
            disabled={createMutation.isPending || !form.name}
            onPress={() =>
              createMutation.mutate({
                name: form.name,
                capacity: parseInt(form.capacity, 10) || 10,
              })
            }
          >
            {t("admin.manage.create")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("admin.manage.createError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* Edit sheet */}
      <AppSheet open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetEditRoom")}
          </Text>
          <Input
            testID="room-edit-name-input"
            placeholder={t("admin.manage.placeholderName")}
            value={editForm.name}
            onChangeText={(v) => setEditForm((s) => ({ ...s, name: v }))}
          />
          <Input
            testID="room-edit-capacity-input"
            placeholder={t("admin.manage.placeholderCapacity")}
            keyboardType="numeric"
            value={editForm.capacity}
            onChangeText={(v) => setEditForm((s) => ({ ...s, capacity: v }))}
          />
          <Button
            testID="room-edit-save-button"
            disabled={updateMutation.isPending || !editForm.name}
            onPress={() => {
              if (!editingId) return;
              updateMutation.mutate({
                id: editingId,
                name: editForm.name,
                capacity: parseInt(editForm.capacity, 10) || 10,
              });
            }}
          >
            {t("admin.schedule.saveChanges")}
          </Button>
          <Button
            testID="room-edit-delete-button"
            variant="danger"
            disabled={deleteMutation.isPending || !editingId}
            onPress={() => setConfirmDelete(true)}
          >
            {t("confirm.deleteRoomConfirm")}
          </Button>
          {updateMutation.isError ? (
            <ErrorState
              message={
                (updateMutation.error as Error)?.message ??
                t("admin.manage.createError")
              }
            />
          ) : null}
        </View>
      </AppSheet>
      <ConfirmSheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirm.deleteRoomTitle")}
        message={t("confirm.deleteRoomMessage")}
        confirmLabel={t("confirm.deleteRoomConfirm")}
        loading={deleteMutation.isPending}
        testID="room-delete-confirm-button"
        errorMessage={
          deleteMutation.isError
            ? (deleteMutation.error as Error)?.message ?? null
            : null
        }
        onConfirm={() => {
          if (!editingId) return;
          deleteMutation.mutate(editingId);
        }}
      />
      </ScrollView>
    </ScreenContainerRaw>
  );
}
