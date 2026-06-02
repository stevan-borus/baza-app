import React from "react";
import { Linking, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "./sheet";
import { Button } from "./button";
import { contactLinks } from "@/lib/contact-links";

type ContactSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The phone number to act on (any human formatting is tolerated). */
  phone: string;
};

/**
 * Quick-action bottom sheet for a client's phone number: Call / SMS /
 * WhatsApp. Each row opens the matching deep link (tel:/sms:/wa.me) and
 * closes the sheet. Used from the client-detail header so admins and trainers
 * can reach a client from one tap on the number.
 */
export function ContactSheet({ open, onOpenChange, phone }: ContactSheetProps) {
  const { t } = useTranslation();
  const links = contactLinks(phone);

  function openAnd(url: string) {
    onOpenChange(false);
    // Fire-and-forget — the OS surfaces its own error if no handler exists
    // (e.g. WhatsApp not installed). Nothing actionable for us to recover.
    void Linking.openURL(url);
  }

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-4">
        <Text
          className="text-foreground font-display"
          style={{ fontSize: 22, lineHeight: 28 }}
        >
          {t("admin.clients.contactTitle")}
        </Text>
        <Text className="text-muted" style={{ fontSize: 14 }} numberOfLines={1}>
          {phone}
        </Text>
        <View className="flex-col gap-2 mt-2">
          <Button
            testID="contact-action-call"
            variant="primary"
            onPress={() => openAnd(links.tel)}
          >
            {t("admin.clients.contactCall")}
          </Button>
          <Button
            testID="contact-action-sms"
            variant="secondary"
            onPress={() => openAnd(links.sms)}
          >
            {t("admin.clients.contactSms")}
          </Button>
          <Button
            testID="contact-action-whatsapp"
            variant="secondary"
            onPress={() => openAnd(links.whatsapp)}
          >
            {t("admin.clients.contactWhatsapp")}
          </Button>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </View>
      </View>
    </AppSheet>
  );
}
