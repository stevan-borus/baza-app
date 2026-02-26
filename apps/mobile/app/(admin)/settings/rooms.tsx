import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, YStack } from "tamagui";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, ListRow } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { HEADER_HEIGHT, TAB_BAR_HEIGHT } from "@/components/ui/constants";
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
      <ActionButton
        icon="plus"
        label={t("admin.manage.sheetNewRoom")}
        onPress={() => setShowCreate(true)}
      />
      {(roomsQuery.data?.rooms ?? []).map((room) => (
        <Card key={room.id}>
          <ListRow title={room.name} subtitle={String(room.capacity)} />
        </Card>
      ))}

      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <YStack gap="$4">
          <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
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
        </YStack>
      </AppSheet>
    </ScrollView>
  );
}

