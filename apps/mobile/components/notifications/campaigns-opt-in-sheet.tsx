import { useRef } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useUpdatePreferencesMutation } from "@/lib/queries/notifications-queries-factory";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Records that the client has been asked — fires once, whatever the answer. */
  onSeen: () => void;
};

/**
 * One-time marketing opt-in prompt.
 *
 * Serbia requires opt-IN for marketing, so campaignsEnabled defaults to false
 * and the client is never asked. This asks once per user per device; both
 * answers and a swipe-dismiss count as asked.
 */
export function CampaignsOptInSheet({ open, onOpenChange, onSeen }: Props) {
  const { t } = useTranslation();
  const updatePreferences = useUpdatePreferencesMutation();

  // The prompt is one-shot: whichever way it closes, it is answered exactly
  // once. A ref (not state) so a re-render can't ask again.
  const seenRef = useRef(false);
  function markSeen() {
    if (seenRef.current) return;
    seenRef.current = true;
    onSeen();
  }

  // A swipe-down or backdrop tap closes the sheet without a button press;
  // that still counts as asked.
  function handleOpenChange(next: boolean) {
    if (!next) markSeen();
    onOpenChange(next);
  }

  function handleAccept() {
    updatePreferences.mutate({ campaignsEnabled: true });
    markSeen();
    onOpenChange(false);
  }

  function handleDecline() {
    markSeen();
    onOpenChange(false);
  }

  return (
    <AppSheet open={open} onOpenChange={handleOpenChange}>
      <View testID="campaigns-opt-in-sheet" className="flex-col gap-5">
        <Text
          className="text-foreground font-body-bold"
          style={{ fontSize: 24, letterSpacing: -0.3 }}
        >
          {t("client.campaignsOptIn.title")}
        </Text>
        <Text className="text-[15px] text-muted-foreground leading-6">
          {t("client.campaignsOptIn.body")}
        </Text>
        <View className="flex-col gap-3">
          <Button
            testID="campaigns-opt-in-accept"
            accessibilityLabel={t("client.campaignsOptIn.acceptA11y")}
            onPress={handleAccept}
          >
            {t("client.campaignsOptIn.accept")}
          </Button>
          <Button
            variant="ghost"
            testID="campaigns-opt-in-decline"
            accessibilityLabel={t("client.campaignsOptIn.declineA11y")}
            onPress={handleDecline}
          >
            {t("client.campaignsOptIn.decline")}
          </Button>
        </View>
      </View>
    </AppSheet>
  );
}
