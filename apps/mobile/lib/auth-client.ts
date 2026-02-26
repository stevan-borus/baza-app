import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { sharedEnv } from "@/lib/env.shared";

export const authClient = createAuthClient({
  baseURL: sharedEnv.EXPO_PUBLIC_API_URL || undefined,
  disableDefaultFetchPlugins: true,
  plugins: [
    expoClient({
      scheme: "baza",
      storagePrefix: "baza",
      storage: SecureStore,
      cookiePrefix: "better-auth",
    }),
  ],
});
