import type { MiddlewareFunction } from "expo-router/server";
import { startCronScheduler } from "@/lib/server/cron-scheduler";

export const unstable_settings = {
  matcher: {
    patterns: ["/api/[...path]"],
  },
};

startCronScheduler();

const middleware: MiddlewareFunction = (request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/auth")) {
    process.stderr.write(`[auth-middleware] ${request.method} ${pathname}\n`);
  }
};

export default middleware;
