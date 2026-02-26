import { serverEnv } from "@/lib/server/env.server";
import { sharedEnv } from "@/lib/server/env.shared";

export const env = {
  ...serverEnv,
  ...sharedEnv,
} as const;
