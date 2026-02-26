import { z } from "zod";

const sharedEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().default(""),
});

const parsed = sharedEnvSchema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});

const normalizedApiOrigin = parsed.EXPO_PUBLIC_API_URL.trim().replace(/\/$/, "");

export const sharedEnv = {
  ...parsed,
  // Empty string means same-origin (for deployed Expo server).
  EXPO_PUBLIC_API_URL: normalizedApiOrigin,
} as const;

