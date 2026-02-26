import { signInInputSchema } from "@baza/types";
import { auth } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";
import { z } from "zod";

export async function POST(request: Request) {
  process.stderr.write("[auth/sign-in] Route hit – request received\n");
  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = signInInputSchema.safeParse(body);
  if (!parsed.success) {
    console.log(
      "[auth/sign-in] Invalid payload:",
      z.prettifyError(parsed.error),
    );
    return fail("Invalid payload", 400, parsed.error);
  }

  const { email } = parsed.data;
  console.log("[auth/sign-in] Attempt for email:", email);
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      authAccounts: {
        where: { providerId: "credential" },
        select: { id: true, password: true },
      },
    },
  });
  if (!user) {
    console.log("[auth/sign-in] No user found for email:", email);
  } else {
    const hasUserHash = !!user.passwordHash;
    const credentialAccount = user.authAccounts[0];
    const hasCredentialAccount = !!credentialAccount;
    const hasAccountPassword = !!credentialAccount?.password;
    console.log(
      "[auth/sign-in] User exists:",
      user.id,
      "| User.passwordHash set:",
      hasUserHash,
      "| AuthAccount(credential) exists:",
      hasCredentialAccount,
      "| AuthAccount.password set:",
      hasAccountPassword,
    );
  }

  const response = await auth.api.signInEmail({
    body: parsed.data,
    headers: request.headers,
    asResponse: true,
  });

  const status = response.status;
  const clone = response.clone();
  let bodyText: string;
  try {
    bodyText = await clone.text();
  } catch {
    bodyText = "(failed to read body)";
  }
  console.log("[auth/sign-in] Response status:", status);
  if (status >= 400) {
    console.log("[auth/sign-in] Response body:", bodyText);
  } else if (status === 200) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      parsed = null;
    }
    const body = parsed as { user?: { id?: string; email?: string; name?: string; fullName?: string }; token?: string } | null;
    const userKeys = body?.user ? Object.keys(body.user) : [];
    console.log("[auth/sign-in] Response 200 – body keys:", body ? Object.keys(body) : [], "| user keys:", userKeys, "| has user.id:", !!body?.user?.id, "| has user.email:", !!body?.user?.email);
  }

  return response;
}
