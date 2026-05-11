import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { useThemeTokens } from "@/components/ui/tokens";

const AVATAR_SIZE = 32;

type CatalogRow = {
  key: string;
  label: string;
  path: "/(admin)/katalog/tipovi-treninga" | "/(admin)/katalog/sale" | "/(admin)/katalog/tipovi-paketa";
  icon: React.ComponentProps<typeof Feather>["name"];
};

/**
 * Avatar-style trigger rendered in a screen header's rightSlot (or combined
 * with another icon). Tapping opens a bottom sheet listing the three catalog
 * screens (Tipovi treninga / Sale / Tipovi paketa) that are hidden from the
 * tab bar (Phase 1 navigation — language / logout rows are Phase 4).
 */
export function AvatarMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const [open, setOpen] = useState(false);

  const go = (path: CatalogRow["path"]) => {
    setOpen(false);
    router.push(path);
  };

  const rows: CatalogRow[] = [
    {
      key: "classTypes",
      label: t("adminMenu.classTypes"),
      path: "/(admin)/katalog/tipovi-treninga",
      icon: "list",
    },
    {
      key: "rooms",
      label: t("adminMenu.rooms"),
      path: "/(admin)/katalog/sale",
      icon: "home",
    },
    {
      key: "packageTypes",
      label: t("adminMenu.packageTypes"),
      path: "/(admin)/katalog/tipovi-paketa",
      icon: "package",
    },
  ];

  return (
    <>
      {/* Catalog trigger — circular grid icon, same hit target as HeaderIconButton */}
      <Pressable
        testID="open-catalog-menu"
        onPress={() => setOpen(true)}
        hitSlop={12}
        android_ripple={null}
        className="active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel={t("adminMenu.openMenu")}
      >
        <View
          className="rounded-full bg-foreground items-center justify-center"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
        >
          <Feather name="grid" size={14} color={tokens.background} />
        </View>
      </Pressable>

      {/* Catalog sheet — three rows, closes after tap */}
      <AppSheet open={open} onOpenChange={setOpen}>
        <View className="flex-col gap-1 pb-2">
          <Text
            className="text-foreground font-body-bold mb-3"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("adminMenu.catalog")}
          </Text>
          {rows.map((row, idx) => (
            <View key={row.key}>
              {idx > 0 ? (
                <View className="bg-glass-border" style={{ height: 1 }} />
              ) : null}
              <Pressable
                testID={`catalog-menu-${row.key}`}
                onPress={() => go(row.path)}
                android_ripple={null}
                className="flex-row items-center gap-3 py-4 active:opacity-60"
              >
                <Feather name={row.icon} size={18} color={tokens.muted} />
                <Text
                  className="text-foreground font-body-medium flex-1"
                  style={{ fontSize: 16 }}
                >
                  {row.label}
                </Text>
                <Feather name="chevron-right" size={16} color={tokens.faint} />
              </Pressable>
            </View>
          ))}
        </View>
      </AppSheet>
    </>
  );
}
