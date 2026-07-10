import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/clients";
import { prisma } from "@/lib/server/prisma";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

async function seedClient(opts: {
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}) {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      role: "CLIENT",
      isActive: opts.isActive,
    },
  });
  await prisma.clientProfile.create({ data: { userId: user.id } });
  return user;
}

type ClientsResponse = {
  success: boolean;
  clients: Array<{ user: { email: string } }>;
};

describe("clients API — soft-delete (isActive) filter", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("excludes soft-deleted (isActive:false) clients from the admin list", async () => {
    await seedClient({
      email: "active@test.local",
      firstName: "Active",
      lastName: "Client",
      isActive: true,
    });
    await seedClient({
      email: "deleted@test.local",
      firstName: "Deleted",
      lastName: "Client",
      isActive: false,
    });
    asAdmin();

    const res = await GET(new Request("http://test.local/api/clients"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClientsResponse;

    const emails = body.clients.map((c) => c.user.email);
    expect(emails).toContain("active@test.local");
    expect(emails).not.toContain("deleted@test.local");
  });
});
