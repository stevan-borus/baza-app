// Single API catch-all. Every non-auth /api/* request lands here and is routed
// by server/dispatch.ts to a handler under server/routes/**.
//
// Why one route instead of 76: `expo export` emits a self-contained ~8.7MB
// server bundle PER +api.ts route, each re-embedding the whole Prisma + pg
// module graph. In the long-lived Fly Node process every route's first hit
// permanently retained another full graph copy, staircasing RSS until the
// 512MB box OOM-aborted (exit 134). Collapsing to this one catch-all yields a
// single shared bundle. The better-auth catch-all (app/api/auth/[...all]/+api.ts)
// stays a real expo route and keeps owning /api/auth/*.
//
// Methods enumerated to match expo-server's `mod[request.method]` lookup: a
// method with no export here produces expo-server's own 405, reproduced in the
// dispatcher for a matched-but-unsupported method.

import { dispatch } from "@/server/dispatch";

export function GET(request: Request) {
  return dispatch(request);
}

export function POST(request: Request) {
  return dispatch(request);
}

export function PATCH(request: Request) {
  return dispatch(request);
}

export function PUT(request: Request) {
  return dispatch(request);
}

export function DELETE(request: Request) {
  return dispatch(request);
}
