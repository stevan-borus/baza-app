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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { SectionLabel } from "@/components/ui/typography";
import { HEADER_HEIGHT, TAB_BAR_HEIGHT } from "@/components/ui/constants";
import { ACCENT_LIGHT } from "@/components/ui/tokens";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";

export default function AdminSettingsRooms() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", capacity: "" });

  const roomsQuery = useQuery(roomsQueries.list());

  const createMutation = useMutation({
    ...roomsQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setShowCreate(false);
      setForm({ name: "", capacity: "" });
    },
  });

  const rooms = roomsQuery.data?.rooms ?? [];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 28,
        paddingHorizontal: 20,
        paddingBottom: TAB_BAR_HEIGHT + 16,
        gap: 12,
      }}
    >
      {/* Section label + add button */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350 }}
      >
        <View className="flex-row items-center justify-between mb-1">
          <SectionLabel>
            {t("admin.manage.rooms")} · {rooms.length}
          </SectionLabel>
          <Pressable
            onPress={() => setShowCreate(true)}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <View
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: ACCENT_LIGHT + "33" }}
            >
              <FontAwesome name="plus" size={10} color={ACCENT_LIGHT} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: ACCENT_LIGHT }}>
                {t("admin.manage.sheetNewRoom")}
              </Text>
            </View>
          </Pressable>
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
          <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
            <View className="flex-row items-center px-4 py-3.5 gap-3.5">
              {/* Door / location icon */}
              <View
                className="items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: "rgba(74,140,107,0.15)",
                }}
              >
                <FontAwesome name="map-marker" size={15} color={ACCENT_LIGHT} />
              </View>

              {/* Name */}
              <Text
                className="text-foreground font-medium flex-1"
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
            className="text-foreground font-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetNewRoom")}
          </Text>
          <Input
            placeholder={t("admin.manage.placeholderName")}
            value={form.name}
            onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderCapacity")}
            keyboardType="numeric"
            value={form.capacity}
            onChangeText={(v) => setForm((s) => ({ ...s, capacity: v }))}
          />
          <Button
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
    </ScrollView>
  );
}
