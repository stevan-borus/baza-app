import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
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

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  baseURL: env.BASE_URL,
  trustedOrigins,
  plugins: [expo()],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    modelName: "User",
    fields: {
      name: "fullName",
    },
    additionalFields: {
      role: {
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
        const user = (ctx as { context?: { user?: { email?: string } } })
          .context?.user?.email;
        console.log(
          "[better-auth] sign-in/email after – user in context:",
          user ?? "(often empty here; success = 200 + token in body)",
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
