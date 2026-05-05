import type { MiddlewareFunction } from "expo-router/server";
import { startCronScheduler } from "@/lib/server/cron-scheduler";

export const unstable_settings = {
  matcher: {
    patterns: ["/api/[...path]"],
  },
};

startCronScheduler();

const middleware: MiddlewareFunction = (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  // Surface every API hit on stderr so devs see traffic in `pnpm dev`.
  // `console.log` is unreliable inside Expo Router API routes; `process.stderr.write` is.
  const search = url.search ? url.search : "";
  process.stderr.write(`[api] ${request.method} ${pathname}${search}\n`);
};

export default middleware;
