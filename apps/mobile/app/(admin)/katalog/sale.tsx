/**
 * Admin Settings — Rooms management screen.
 * Design references (from docs/inspiration/):
 * - Linear Mobile ios Apr 2026/ — glass list rows with icon + meta
 * - Apple Fitness ios Feb 2026/ — icon-accented rows
 *
 * Each room is rendered as a GlassCard row:
 *   door icon  |  name  |  capacity badge  |  chevron
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { SectionLabel } from "@/components/ui/typography";
import { ACCENT_LIGHT } from "@/components/ui/tokens";
import {
  roomsQueries,
  createRoomMutationOptions,
  updateRoomMutationOptions,
} from "@/lib/queries/rooms-queries-factory";
import { useAdminCrud } from "@/lib/admin/use-admin-crud";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";

export default function AdminSettingsRooms() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const roomsQuery = useQuery(roomsQueries.list());

  // Cache upkeep (list splice / invalidation) stays in the factory options;
  // the sheet choreography (open/close/reset) lives in the CRUD machine.
  const crud = useAdminCrud({
    empty: { name: "", capacity: "" },
    toForm: (room: { id: string; name: string; capacity: number }) => ({
      name: room.name,
      capacity: String(room.capacity),
    }),
    create: createRoomMutationOptions(queryClient),
    update: updateRoomMutationOptions(queryClient),
    remove: {
      ...roomsQueries.delete(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: roomsQueries.all });
      },
    },
  });

  const rooms = roomsQuery.data?.rooms ?? [];

  return (
    <ScreenContainerRaw
      title={t("admin.manage.rooms")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={crud.openCreate}
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
      {roomsQuery.isLoading ? (
        <View style={{ gap: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {rooms.map((room, idx) => (
        <MotiView
          key={room.id}
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: idx * 60 }}
        >
          <Pressable
            testID={`room-row-${room.id}`}
            onPress={() => crud.openEdit(room)}
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
                  <Icon name="users" size={11} color="#a1a1aa" />
                  <Text className="text-muted" style={{ fontSize: 13 }}>
                    {room.capacity}
                  </Text>
                  <Icon name="chevron-right" size={11} color="#52525b" />
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
            <Icon name="map-marker" size={32} color="#3f3f46" />
            <Text className="text-muted mt-3" style={{ fontSize: 14 }}>
              {t("admin.manage.rooms")}
            </Text>
          </View>
        </MotiView>
      )}

      {/* Create sheet */}
      <AppSheet open={crud.showCreate} onOpenChange={crud.onCreateOpenChange}>
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
            value={crud.form.name}
            onChangeText={(v) => crud.setForm({ name: v })}
          />
          <Input
            testID="room-capacity-input"
            placeholder={t("admin.manage.placeholderCapacity")}
            keyboardType="numeric"
            value={crud.form.capacity}
            onChangeText={(v) => crud.setForm({ capacity: v })}
          />
          <Button
            testID="room-create-submit"
            disabled={crud.createMutation.isPending || !crud.form.name}
            onPress={() =>
              crud.submitCreate({
                name: crud.form.name.trim(),
                capacity: parseInt(crud.form.capacity, 10) || 10,
              })
            }
          >
            {t("admin.manage.create")}
          </Button>
          {crud.createMutation.isError ? (
            <ErrorState message={t("admin.manage.createError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* Edit sheet */}
      <AppSheet open={!!crud.editingId} onOpenChange={crud.onEditOpenChange} stackBehavior="push">
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
            value={crud.editForm.name}
            onChangeText={(v) => crud.setEditForm({ name: v })}
          />
          <Input
            testID="room-edit-capacity-input"
            placeholder={t("admin.manage.placeholderCapacity")}
            keyboardType="numeric"
            value={crud.editForm.capacity}
            onChangeText={(v) => crud.setEditForm({ capacity: v })}
          />
          <Button
            testID="room-edit-save-button"
            disabled={crud.updateMutation.isPending || !crud.editForm.name}
            onPress={() => {
              if (!crud.editingId) return;
              crud.submitUpdate({
                id: crud.editingId,
                name: crud.editForm.name.trim(),
                capacity: parseInt(crud.editForm.capacity, 10) || 10,
              });
            }}
          >
            {t("admin.schedule.saveChanges")}
          </Button>
          <Button
            testID="room-edit-delete-button"
            variant="danger"
            disabled={crud.removeMutation.isPending || !crud.editingId}
            onPress={crud.askDelete}
          >
            {t("confirm.deleteRoomConfirm")}
          </Button>
          {crud.updateMutation.isError ? (
            <ErrorState
              message={
                (crud.updateMutation.error as Error)?.message ??
                t("admin.manage.createError")
              }
            />
          ) : null}
        </View>
      </AppSheet>
      <ConfirmSheet
        stackBehavior="push"
        open={crud.confirmDelete}
        onOpenChange={crud.onDeleteOpenChange}
        title={t("confirm.deleteRoomTitle")}
        message={t("confirm.deleteRoomMessage")}
        confirmLabel={t("confirm.deleteRoomConfirm")}
        loading={crud.removeMutation.isPending}
        testID="room-delete-confirm-button"
        errorMessage={
          crud.removeMutation.isError
            ? (crud.removeMutation.error as Error)?.message ?? null
            : null
        }
        onConfirm={() => {
          if (!crud.editingId) return;
          crud.submitDelete(crud.editingId);
        }}
      />
      </ScrollView>
    </ScreenContainerRaw>
  );
}
