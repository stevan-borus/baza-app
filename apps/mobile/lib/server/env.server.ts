import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z
    .string()
    .min(1)
    .default("Baza Pilates <no-reply@example.com>"),
  EXPO_ACCESS_TOKEN: z.string().min(1),
  API_ADMIN_BOOTSTRAP_TOKEN: z.string().min(1),
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(48),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  CRON_AUTOSTART: z.enum(["true", "false"]).transform((value) => value === "true"),
  CRON_REMINDERS_INTERVAL_MS: z.coerce.number().int().positive(),
  CRON_PACKAGE_EXPIRY_INTERVAL_MS: z.coerce.number().int().positive(),
  CRON_SESSION_CONSUMPTION_INTERVAL_MS: z.coerce.number().int().positive(),
  BASE_URL: z.url().default("http://localhost:3010"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),
});

const source = {
  DATABASE_URL: process.env.DATABASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN,
  API_ADMIN_BOOTSTRAP_TOKEN: process.env.API_ADMIN_BOOTSTRAP_TOKEN,
  INVITE_TOKEN_TTL_HOURS: process.env.INVITE_TOKEN_TTL_HOURS,
  RESET_TOKEN_TTL_MINUTES: process.env.RESET_TOKEN_TTL_MINUTES,
  CRON_AUTOSTART: process.env.CRON_AUTOSTART,
  CRON_REMINDERS_INTERVAL_MS: process.env.CRON_REMINDERS_INTERVAL_MS,
  CRON_PACKAGE_EXPIRY_INTERVAL_MS: process.env.CRON_PACKAGE_EXPIRY_INTERVAL_MS,
  CRON_SESSION_CONSUMPTION_INTERVAL_MS: process.env.CRON_SESSION_CONSUMPTION_INTERVAL_MS,
  BASE_URL: process.env.BASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
};

export const serverEnv = serverSchema.parse(source);
