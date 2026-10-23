import type { Href } from "expo-router";
import { authClient } from "@/lib/auth-client";

export const APP_ROLES = ["ADMIN", "TRAINER", "CLIENT"] as const;

export type AppRole = (typeof APP_ROLES)[number];

const ROLE_HOME_HREFS = {
  ADMIN: "/(admin)/pregled",
  TRAINER: "/(trainer)/raspored",
  CLIENT: "/(client)",
} as const satisfies Record<AppRole, Href>;

export function getRoleHomeHref(role: AppRole | null): Href {
  return role ? ROLE_HOME_HREFS[role] : "/sign-in";
}

type SessionUser = {
  role?: string | null;
};

/**
 * Normalizes role from Better Auth session to our app role union.
 */
export function readSessionRole(user: unknown): AppRole | null {
  if (!user || typeof user !== "object") return null;
  const candidate = (user as SessionUser).role;
  if (!candidate) return null;
  if ((APP_ROLES as readonly string[]).includes(candidate)) {
    return candidate as AppRole;
  }
  return null;
}

/**
 * Shared auth state for route guards and role-based redirects.
 */
export function useSessionAuth() {
  const session = authClient.useSession();
  const role = readSessionRole(session.data?.user);
  // Ignores `error`: a network failure keeps the last known session, and a
  // real 401 already clears `data`.
  const isAuthenticated = !!session.data?.session && !!role;
  return { ...session, role, isAuthenticated };
}

/** The fields of better-auth's session atom state `confirmSession` reads. */
type SessionState = {
  data: { session?: unknown } | null;
  error: { status?: number } | null;
  isPending: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
};

/** The slice of a nanostores atom `confirmSession` reads. */
export type SessionAtom = {
  get(): SessionState;
  listen(listener: (state: SessionState) => void): () => void;
};

/** The session atom with `set`, for code that clears it. */
export type WritableSessionAtom = SessionAtom & {
  set(state: SessionState): void;
};

const RETRY_DELAYS_MS = [500, 1000, 2000] as const;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Resolves with the atom's state once no session fetch is in flight. */
function settled(atom: SessionAtom): Promise<SessionState> {
  return new Promise((resolve) => {
    const current = atom.get();
    if (!current.isPending && !current.isRefetching) {
      resolve(current);
      return;
    }
    const unlisten = atom.listen((next) => {
      if (next.isPending || next.isRefetching) return;
      unlisten();
      resolve(next);
    });
  });
}

/**
 * Called after a successful sign-in: fetches the session into the atom the
 * route guards read and resolves true once it holds one. A get-session that
 * fails on the network is retried after each of `retryDelaysMs`; a 401 is a
 * real "no session" and is not.
 */
export async function confirmSession({
  atom = authClient.$store.atoms.session,
  retryDelaysMs = RETRY_DELAYS_MS,
}: {
  atom?: SessionAtom;
  retryDelaysMs?: readonly number[];
} = {}): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    await atom.get().refetch();
    // An aborted refetch resolves while the fetch that replaced it is still
    // in flight, so wait for the atom itself to settle.
    const state = await settled(atom);
    // A failed fetch keeps the previous data (e.g. the SecureStore cache).
    // The guards keep that last known session through network errors, but
    // confirming a sign-in needs a fresh, error-free fetch.
    if (state.data?.session && !state.error) return true;
    if (state.error?.status === 401) return false;
    if (attempt >= retryDelaysMs.length) return false;
    await delay(retryDelaysMs[attempt]);
  }
}
