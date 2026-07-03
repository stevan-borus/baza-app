import { vi } from "vitest";

// Canonical vi.mock factory for "@/lib/server/notifications". Use as:
//   vi.mock("@/lib/server/notifications", notificationsMock);
// Each test file gets its own vi.fn instance, so per-file call assertions
// via vi.mocked(createSystemNotification) keep working unchanged.
export function notificationsMock() {
  return {
    createSystemNotification: vi.fn(async () => undefined),
  };
}
