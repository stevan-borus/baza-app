import { z } from "zod";

const sharedSchema = z.object({
  APP_WEB_URL: z.url().default("http://localhost:8081"),
});

export const sharedEnv = sharedSchema.parse({
  APP_WEB_URL: process.env.APP_WEB_URL,
});
