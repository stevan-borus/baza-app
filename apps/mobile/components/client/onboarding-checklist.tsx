import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, XStack, YStack } from "tamagui";
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
    <XStack gap="$3" items="center" py="$2">
      <FontAwesome
        name={done ? "check-circle" : "circle-o"}
        size={20}
        color={done ? "#4ade80" : "#6b7280"}
      />
      <Text
        fontSize="$3"
        color={done ? "$color" : "$color9"}
        textDecorationLine={done ? "line-through" : "none"}
      >
        {label}
      </Text>
    </XStack>
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
        <YStack gap="$3" items="center">
          <Text fontSize="$5" fontWeight="700" color="$accent1">
            {t("client.onboarding.allSet")}
          </Text>
          <Button variant="ghost" size="small" onPress={handleDismiss}>
            {t("client.onboarding.dismiss")}
          </Button>
        </YStack>
      </GlassCard>
    );
  }

  const completed = [profileCompleted, firstClassBooked, notificationsConfigured].filter(Boolean).length;
  const progress = completed / 3;

  return (
    <GlassCard>
      <YStack gap="$3">
        <Text fontSize="$5" fontWeight="700" color="$color">
          {t("client.onboarding.getStarted")}
        </Text>
        {/* Progress bar */}
        <YStack height={4} bg="$backgroundHover" borderRadius={2} overflow="hidden">
          <YStack
            height={4}
            bg="$accent1"
            borderRadius={2}
            width={`${progress * 100}%` as `${number}%`}
          />
        </YStack>
        <CheckRow done={profileCompleted} label={t("client.onboarding.profileComplete")} />
        <CheckRow
          done={firstClassBooked}
          label={t("client.onboarding.firstClassBooked")}
        />
        <CheckRow
          done={notificationsConfigured}
          label={t("client.onboarding.notificationsOn")}
        />
      </YStack>
    </GlassCard>
  );
}
