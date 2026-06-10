import { z } from "zod";

const sharedEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().default(""),
  // Store listing URLs for the web "Get the app" fallback. Empty until the app
  // is published. Android can default from the package id (Play resolves it
  // even pre-publish); iOS needs the numeric App Store id, so it stays empty
  // (no banner) until set.
  EXPO_PUBLIC_IOS_STORE_URL: z.string().default(""),
  EXPO_PUBLIC_ANDROID_STORE_URL: z
    .string()
    .default(
      "https://play.google.com/store/apps/details?id=com.steva.borus.bazapilates",
    ),
});

const parsed = sharedEnvSchema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_IOS_STORE_URL: process.env.EXPO_PUBLIC_IOS_STORE_URL,
  EXPO_PUBLIC_ANDROID_STORE_URL: process.env.EXPO_PUBLIC_ANDROID_STORE_URL,
});

const normalizedApiOrigin = parsed.EXPO_PUBLIC_API_URL.trim().replace(/\/$/, "");

export const sharedEnv = {
  ...parsed,
  // Empty string means same-origin (for deployed Expo server).
  EXPO_PUBLIC_API_URL: normalizedApiOrigin,
} as const;

