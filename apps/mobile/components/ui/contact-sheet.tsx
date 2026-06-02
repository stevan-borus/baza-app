import React from "react";
import { Linking, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "./sheet";
import { Button } from "./button";
import { Icon } from "./icon";
import { useThemeTokens } from "./tokens";
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
  const tokens = useThemeTokens();
  const links = contactLinks(phone);

  function openAnd(url: string) {
    onOpenChange(false);
    // openURL() REJECTS when no app can handle the scheme — a simulator with
    // no Mail/Phone, or a client without WhatsApp installed. Swallow it so a
    // missing handler is a no-op, not an uncaught-rejection error overlay.
    Linking.openURL(url).catch(() => {});
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
            <Icon name="phone" size={17} color="#ffffff" />
            <Text className="text-white font-body-semibold text-sm">
              {t("admin.clients.contactCall")}
            </Text>
          </Button>
          <Button
            testID="contact-action-sms"
            variant="secondary"
            onPress={() => openAnd(links.sms)}
          >
            <Icon name="message" size={17} color={tokens.foreground} />
            <Text className="text-foreground font-body-semibold text-sm">
              {t("admin.clients.contactSms")}
            </Text>
          </Button>
          <Button
            testID="contact-action-whatsapp"
            variant="whatsapp"
            onPress={() => openAnd(links.whatsapp)}
          >
            <Icon name="message" size={17} color="#ffffff" />
            <Text className="text-white font-body-semibold text-sm">
              {t("admin.clients.contactWhatsapp")}
            </Text>
          </Button>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </View>
      </View>
    </AppSheet>
  );
}
