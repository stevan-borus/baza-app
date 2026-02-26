import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

const THEME_PREFERENCE_KEY = "baza.theme-preference";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

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

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch(() => {
      // Ignore local storage write issues.
    });
  }

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
      preference: "system" as ThemePreference,
      resolvedTheme: (useSystemColorScheme() === "dark" ? "dark" : "light") as ResolvedTheme,
      setPreference: () => {},
    };
  }
  return context;
}

