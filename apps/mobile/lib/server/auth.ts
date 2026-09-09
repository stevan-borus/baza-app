import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "@/lib/server/prisma";
import { env } from "@/lib/server/env";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import {
  getActiveLock,
  recordFailedSignIn,
  recordSuccessfulSignIn,
} from "@/lib/server/sign-in-lock";

const trustedOrigins = [
  env.BASE_URL,
  env.APP_WEB_URL,
  "baza://",
  ...(process.env.NODE_ENV === "development"
    ? ["exp://", "exp://**", "exp://192.168.*.*:*/**", "exp://10.0.0.*:*/**"]
    : []),
];

// Cache the better-auth instance on globalThis across bundle boundaries. Like
// prisma, after the API consolidation multiple server bundles (middleware, the
// better-auth catch-all, our [...rest] catch-all) each hold their own copy of
// this module in the one Node process; module-scope `const` only dedups within
// a bundle. betterAuth() builds a non-trivial instance (Prisma adapter, expo
// plugin, cookie/crypto config) at module scope, so we build it lazily inside
// the cache-miss and share the single instance via globalThis.
const globalForAuth = globalThis as unknown as {
  auth?: ReturnType<typeof createAuth>;
};

function createAuth() {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    baseURL: env.BASE_URL,
    trustedOrigins,
    plugins: [
      expo(),
      // Enrich every session's `user` with the fields our route guards need
      // (`getRequestUser` in auth-guards.ts) so they can trust the session and
      // skip a redundant per-request `user.findUnique`. `role`, `isActive`,
      // `firstName`, `lastName`, and `createdAt` already ride on the base user
      // row better-auth loads during getSession (role/isActive/lastName via
      // additionalFields below); only `clientProfileId` is a relation, so we
      // fetch it here — and only for CLIENT users, who are the only ones with a
      // profile. Admins/trainers pay zero extra queries. Because this runs on
      // every getSession, `isActive`/role are always live: deactivation and
      // role changes take effect immediately, with no cookie-cache lag.
      customSession(async ({ user, session }) => {
        // better-auth maps our `firstName` column onto its logical `name`
        // field (see `fields.name` below), so on read it surfaces as
        // `user.name`, not `user.firstName`. Re-expose it as `firstName` for
        // the guard/response layer. `lastName`, `role`, and `isActive` are
        // real additionalFields, so they're already present.
        const u = user as typeof user & {
          role: string;
          isActive: boolean;
          lastName: string;
        };
        const clientProfile =
          u.role === "CLIENT"
            ? await prisma.clientProfile.findUnique({
                where: { userId: u.id },
                select: { id: true },
              })
            : null;
        return {
          session,
          user: {
            ...u,
            firstName: u.name,
            clientProfileId: clientProfile?.id ?? null,
          },
        };
      }),
    ],
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    user: {
      modelName: "User",
      fields: {
        // better-auth requires a `name` column, but the app never surfaces it:
        // sign-up is disabled (users are created by our own complete-invite
        // route) and nothing reads better-auth's `name`. We point it at the
        // real `firstName` column as an incidental anchor — `fullName` can't be
        // the target because it's derived at the response layer, not stored.
        name: "firstName",
      },
      additionalFields: {
        role: {
          type: "string",
          input: false,
        },
        isActive: {
          type: "boolean",
          input: false,
        },
        lastName: {
          type: "string",
          input: false,
        },
      },
    },
    account: {
      modelName: "AuthAccount",
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: {
        hash: hashPassword,
        verify: ({ password, hash }) => verifyPassword(password, hash),
      },
    },
    session: {
      modelName: "AuthSession",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    verification: {
      modelName: "AuthVerification",
    },
    // The sign-in lock is enforced here rather than in a route of ours because
    // the app signs in through better-auth's own `/sign-in/email` endpoint —
    // there is no handler of ours in that path to hang the check on.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = (ctx.body as { email?: string } | undefined)?.email;
        if (typeof email !== "string") return;

        const lock = await getActiveLock(email);
        if (!lock) return;

        throw new APIError("LOCKED", {
          code: "ACCOUNT_LOCKED",
          message: "Account temporarily locked",
          lockedUntil: lock.lockedUntil.toISOString(),
        });
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const returned: unknown = ctx.context.returned;

        if (isAPIError(returned)) {
          // Only a rejected password counts. The 423 thrown above is our own
          // lock, and counting it would extend the lock on every retry.
          if (returned.body?.code !== "INVALID_EMAIL_OR_PASSWORD") return;
          const email = (ctx.body as { email?: string } | undefined)?.email;
          if (typeof email === "string") await recordFailedSignIn(email);
          return;
        }

        const userId = (returned as { user?: { id?: string } } | undefined)?.user
          ?.id;
        if (typeof userId === "string") await recordSuccessfulSignIn(userId);
      }),
    },
    // better-auth's default per-IP ceiling is 3 requests / 10s, which a studio
    // on one shared Wi-Fi trips just by having two people sign in at once.
    rateLimit: {
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
      },
    },
    advanced: {
      // Fly terminates TLS and passes the caller's address as Fly-Client-IP;
      // better-auth only reads x-forwarded-for by default, so per-IP limits
      // would otherwise bucket the whole studio under the proxy's address.
      ipAddress: {
        ipAddressHeaders: ["fly-client-ip", "x-forwarded-for"],
      },
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  });
}

export const auth = (globalForAuth.auth ??= createAuth());
