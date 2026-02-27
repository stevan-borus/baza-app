import { useColorScheme } from "@/components/useColorScheme";
import { useTheme } from "tamagui";

/**
 * Shared calendar theme hook for react-native-big-calendar.
 * Used by (client)/calendar, (trainer)/index, and (admin)/index.
 */
export function useCalendarTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = useTheme();

  const borderSubtle = isDark
    ? "rgba(255,255,255,0.05)"
    : "rgba(0,0,0,0.06)";

  return {
    calendarTheme: {
      palette: {
        primary: {
          main: isDark ? "#4ade80" : "#2e5b42",
          contrastText: "#ffffff",
        },
        nowIndicator: isDark ? "#4ade80" : "#2e5b42",
        gray: {
          100: isDark ? "rgba(255,255,255,0.04)" : "hsla(30, 18%, 92%, 1)",
          200: isDark ? "rgba(255,255,255,0.06)" : "hsla(30, 15%, 87%, 1)",
          300: isDark ? "rgba(255,255,255,0.08)" : "hsla(30, 12%, 82%, 1)",
          500: isDark ? "rgba(255,255,255,0.3)" : "hsla(30, 8%, 67%, 1)",
          800: isDark ? "rgba(255,255,255,0.9)" : "hsla(30, 5%, 12%, 1)",
        },
        moreLabel: isDark ? "rgba(255,255,255,0.9)" : "hsla(30, 5%, 25%, 1)",
      },
      typography: {
        sm: { fontWeight: "500" as const, fontSize: 13 },
        xl: { fontWeight: "600" as const, fontSize: 14 },
        moreLabel: { fontWeight: "600" as const, fontSize: 12 },
      },
    },
    calendarContainerStyle: {
      borderRadius: 20,
      backgroundColor: "transparent",
    },
    bodyContainerStyle: {
      backgroundColor: "transparent",
    },
    headerContainerStyle: {
      borderBottomColor: borderSubtle,
      borderBottomWidth: 1,
    },
    eventCellStyle: {
      backgroundColor: isDark ? "#4ade80" : "#2e5b42",
      borderRadius: 10,
      borderWidth: 0,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    eventCellTextColor: (isDark ? "#000000" : "#ffffff") as string,
    calendarCellStyle: {
      backgroundColor: "transparent",
      borderColor: borderSubtle,
      borderWidth: 1,
    },
    calendarCellTextStyle: {
      color: theme.color?.val,
    },
  };
}
