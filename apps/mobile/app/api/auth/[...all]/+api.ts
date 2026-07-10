import { auth } from "@/lib/server/auth";
import { dispatch, isRegisteredRoute } from "@/server/dispatch";

// After the API consolidation, expo-router routes EVERY /api/auth/* request to
// this catch-all (it's ordered before /api/[...rest]). That includes our own
// auth app-routes that used to be specific files — /api/auth/me, /sign-in,
// /sign-out, /complete-invite, /reset-password, /request-password-reset — which
// now live under server/routes/auth/** behind the dispatcher. So we hand those
// back to the dispatcher and only call better-auth's handler for the paths
// better-auth actually owns (/get-session, /sign-in/email, /token, ...).
// Without this, better-auth would 404 our own auth routes.
async function handle(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (isRegisteredRoute(pathname)) {
    return dispatch(request);
  }
  return auth.handler(request);
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}

export function PATCH(request: Request) {
  return handle(request);
}

export function PUT(request: Request) {
  return handle(request);
}

export function DELETE(request: Request) {
  return handle(request);
}
