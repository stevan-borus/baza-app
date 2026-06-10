/**
 * Cross-tab drill back-pill — ADR-0005.
 *
 * Renders a "← Nazad u {label}" pill when the current route was reached via
 * a `returnTo` param. Tapping replaces (not pushes) back to the encoded path
 * so repeat drills don't pile history.
 *
 * Rendered by drill-targetable destination screens (today: Naplata —
 * session-detail and client-detail receive `returnTo` but don't render the
 * pill yet). Adding a destination is a one-liner — drop this component near
 * the top of its ScrollView and you're done.
 */
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { MotiView } from "@/components/ui/styled";
import { useReturnToPill } from "@/lib/admin/drill";

export function ReturnToPill({ testID = "return-to-pill" }: { testID?: string } = {}) {
  const { t } = useTranslation();
  const returnTo = useReturnToPill();
  if (!returnTo) return null;
  return (
    <MotiView
      from={{ opacity: 0, translateY: -4 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 250 }}
    >
      <Pressable
        testID={testID}
        onPress={() =>
          router.replace(returnTo.path as Parameters<typeof router.replace>[0])
        }
        hitSlop={8}
        android_ripple={null}
        className="self-start active:opacity-60 rounded-full border border-glass-border bg-glass px-3 py-1.5"
      >
        <Text className="text-foreground font-body-semibold" style={{ fontSize: 12 }}>
          {t("admin.izvestaji.backTo", { label: returnTo.label })}
        </Text>
      </Pressable>
    </MotiView>
  );
}
