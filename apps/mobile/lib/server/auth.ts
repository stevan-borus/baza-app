import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "@/lib/server/prisma";
import { env } from "@/lib/server/env";
import { hashPassword, verifyPassword } from "@/lib/server/password";

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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email") {
          const email =
            typeof (ctx.body as { email?: string })?.email === "string"
              ? (ctx.body as { email: string }).email
              : "(missing)";
          console.log("[better-auth] sign-in/email before – email:", email);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email") {
          const user = (ctx as { context?: { user?: { email?: string } } }).context?.user?.email;
          console.log(
            "[better-auth] sign-in/email after – user in context:",
            user ?? "(often empty here; success = 200 + token in body)"
          );
        }
      }),
    },
    advanced: {
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
