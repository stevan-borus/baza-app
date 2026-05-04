import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { Uniwind } from "uniwind";

const THEME_PREFERENCE_KEY = "baza.theme-preference";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

export const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("light");

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
        }
      })
      .catch(() => {
        // Ignore local storage read issues.
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync Uniwind's theme registry with the user's preference.
  useEffect(() => {
    Uniwind.setTheme(preference);
  }, [preference]);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch(() => {
      // Ignore local storage write issues.
    });
  }

  // Studio palette is light-first; "system" still respects the system pref,
  // but unset / first-launch resolves to light.
  const resolvedTheme: ResolvedTheme =
    preference === "system"
      ? systemColorScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    return {
      preference: "dark" as ThemePreference,
      resolvedTheme: "dark" as ResolvedTheme,
      setPreference: () => {},
    };
  }
  return context;
}
