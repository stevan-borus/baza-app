import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

interface OnboardingChecklistProps {
  userId: string;
  userName: string;
  bookingCount: number;
  onNavigate: (target: "calendar" | "notifications") => void;
}

const STORAGE_PREFIX = "baza_onboarding_";

function CheckRow({ done, label }: { done: boolean; label: string }) {
  return (
    <View className="flex-row items-center gap-3 py-2">
      <FontAwesome
        name={done ? "check-circle" : "circle-o"}
        size={20}
        color={done ? "#4ade80" : "#6b7280"}
      />
      <Text
        className={`text-base ${
          done ? "text-foreground line-through" : "text-muted"
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export function OnboardingChecklist({
  userId,
  userName,
  bookingCount,
  onNavigate: _onNavigate,
}: OnboardingChecklistProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [notificationsConfigured, setNotificationsConfigured] = useState(false);
  const storageKey = `${STORAGE_PREFIX}${userId}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      if (val) {
        const data = JSON.parse(val);
        setDismissed(data.dismissed ?? false);
        setNotificationsConfigured(data.notificationsConfigured ?? false);
      } else {
        setDismissed(false);
      }
    });
  }, [storageKey]);

  const profileCompleted = !!userName;
  const firstClassBooked = bookingCount > 0;
  const allDone = profileCompleted && firstClassBooked && notificationsConfigured;

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    await AsyncStorage.setItem(storageKey, JSON.stringify({ dismissed: true, notificationsConfigured }));
  }, [storageKey, notificationsConfigured]);

  // Not yet loaded or already dismissed
  if (dismissed === null || dismissed) return null;
  // All steps complete and not yet dismissed — show congrats
  if (allDone) {
    return (
      <GlassCard>
        <View className="flex-col items-center gap-3">
          <Text className="text-2xl font-body-bold text-accent">
            {t("client.onboarding.allSet")}
          </Text>
          <Button variant="ghost" size="small" onPress={handleDismiss}>
            {t("client.onboarding.dismiss")}
          </Button>
        </View>
      </GlassCard>
    );
  }

  const completed = [profileCompleted, firstClassBooked, notificationsConfigured].filter(Boolean).length;
  const progress = completed / 3;

  return (
    <GlassCard>
      <View className="flex-col gap-3">
        <Text className="text-2xl font-body-bold text-foreground">
          {t("client.onboarding.getStarted")}
        </Text>
        {/* Progress bar */}
        <View className="h-1 bg-surface-2 rounded-[2px] overflow-hidden">
          <View
            className="h-1 bg-accent rounded-[2px]"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
        <CheckRow done={profileCompleted} label={t("client.onboarding.profileComplete")} />
        <CheckRow
          done={firstClassBooked}
          label={t("client.onboarding.firstClassBooked")}
        />
        <CheckRow
          done={notificationsConfigured}
          label={t("client.onboarding.notificationsOn")}
        />
      </View>
    </GlassCard>
  );
}
