import { vi } from "vitest";

// Canonical vi.mock factory for "@/lib/server/notifications". Use as:
//   vi.mock("@/lib/server/notifications", notificationsMock);
// Each test file gets its own vi.fn instance, so per-file call assertions
// via vi.mocked(createSystemNotification) keep working unchanged.
// notifyClient also reads getPreferredLocale from this module, so a factory
// that returns only createSystemNotification throws on the missing export.
// Serbian is the project default, so the stub resolves "sr".
export function notificationsMock() {
  return {
    createSystemNotification: vi.fn(async () => undefined),
    getPreferredLocale: vi.fn(async (): Promise<"sr" | "en"> => "sr"),
  };
}
