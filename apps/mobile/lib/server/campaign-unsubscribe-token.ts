import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";

/** HMAC-signs a userId so /api/unsubscribe can opt them out with no login. */
export function signUnsubscribeToken(userId: string): string {
  const sig = createHmac("sha256", env.BETTER_AUTH_SECRET).update(userId).digest("hex");
  const encodedId = Buffer.from(userId, "utf8").toString("base64url");
  return `${encodedId}.${sig}`;
}

/** Verifies a token and returns the userId, or null when forged/malformed. */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encodedId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let userId: string;
  try {
    userId = Buffer.from(encodedId, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", env.BETTER_AUTH_SECRET).update(userId).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return null;
  return timingSafeEqual(sigBuf, expBuf) ? userId : null;
}
