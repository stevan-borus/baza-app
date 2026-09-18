/**
 * Optimistic dismiss contract for the notification swipe-delete.
 *
 * A swipe must remove the row the instant the finger lifts — waiting for the
 * DELETE round-trip leaves the row sitting under the open red panel. onMutate
 * splices the id out of every cached notifications list; onError puts the
 * snapshots back so a failed DELETE doesn't silently lose a notification.
 *
 * Driven via MutationObserver against a real QueryClient — no renderer needed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  notificationsQueries,
  dismissNotificationMutationOptions,
} from "@/lib/queries/notifications-queries-factory";

const INFINITE_KEY = notificationsQueries.listInfinite().queryKey;
const LIST_KEY = notificationsQueries.list().queryKey;

function notification(id: string) {
  return {
    id,
    type: "GENERAL",
    title: `title-${id}`,
    body: `body-${id}`,
    payload: null,
    readAt: null,
    createdAt: new Date("2026-09-17T10:00:00.000Z").toISOString(),
  };
}

type Page = { success: boolean; notifications: ReturnType<typeof notification>[]; nextCursor: string | null };

function seedInfinite(client: QueryClient) {
  client.setQueryData(INFINITE_KEY, {
    pages: [
      { success: true, notifications: [notification("a"), notification("b")], nextCursor: "b" },
      { success: true, notifications: [notification("c")], nextCursor: null },
    ],
    pageParams: [null, "b"],
  });
}

function idsInInfinite(client: QueryClient): string[] {
  const data = client.getQueryData<{ pages: Page[] }>(INFINITE_KEY);
  return (data?.pages ?? []).flatMap((p) => p.notifications.map((n) => n.id));
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seedInfinite(client);
});

function runDismiss(id: string, mode: "success" | "failure") {
  const observer = new MutationObserver(client, {
    ...dismissNotificationMutationOptions(client),
    mutationFn: async () => {
      if (mode === "failure") throw new Error("DELETE failed (500)");
      return { success: true };
    },
  });
  return observer.mutate(id);
}

describe("dismissNotificationMutationOptions — optimistic removal", () => {
  it("removes the row from the infinite cache before the DELETE settles", async () => {
    const observer = new MutationObserver(client, {
      ...dismissNotificationMutationOptions(client),
      mutationFn: () => new Promise<{ success: true }>(() => {}), // never resolves
    });

    observer.mutate("b");

    // onMutate awaits cancelQueries before writing; drain microtasks until the
    // optimistic splice lands (capped so a regression fails instead of hangs).
    for (let i = 0; i < 50; i++) {
      if (!idsInInfinite(client).includes("b")) break;
      await Promise.resolve();
    }

    expect(idsInInfinite(client)).toEqual(["a", "c"]);
  });

  it("removes the row from a page other than the first", async () => {
    await runDismiss("c", "success");
    expect(idsInInfinite(client)).toEqual(["a", "b"]);
  });

  it("also removes the row from the plain list cache the bell reads", async () => {
    client.setQueryData(LIST_KEY, {
      success: true,
      notifications: [notification("a"), notification("b")],
      nextCursor: null,
    });

    await runDismiss("a", "success");

    const list = client.getQueryData<Page>(LIST_KEY);
    expect(list?.notifications.map((n) => n.id)).toEqual(["b"]);
  });

  it("restores every removed row when the DELETE fails", async () => {
    await runDismiss("b", "failure").catch(() => {});
    expect(idsInInfinite(client)).toEqual(["a", "b", "c"]);
  });

  it("leaves the other rows untouched on success", async () => {
    await runDismiss("a", "success");
    expect(idsInInfinite(client)).toEqual(["b", "c"]);
  });
});
