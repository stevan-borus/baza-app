/**
 * Health info — full screen the client opens from the profile sheet to
 * record, edit, or withdraw their health-intake answers.
 *
 * The intake used to live inline on /consent (first-login gate). It moved
 * here so onboarding stays short and so this surface can grow new question
 * sections without crowding the gate.
 */
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { ScreenContainer } from "@/components/ui/screen-container";
import { ProfileHealthSection } from "@/components/profile/profile-health-section";

export default function ClientProfileHealth() {
  const { t } = useTranslation();
  return (
    <ScreenContainer
      title={t("profile.healthSection")}
      headerVariant="detail"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHealthSection />
      </ScrollView>
    </ScreenContainer>
  );
}
