import React, { PropsWithChildren } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar } from "react-native";
import { Theme } from "tamagui";

export function AuthBackground({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return (
    <Theme name="dark">
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={["#0d1a14", "#0A0F14", "#070a0e"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 24,
              maxWidth: 480,
              alignSelf: "center",
              width: "100%",
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Theme>
  );
}
