import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Serbia requires marketing opt-IN, so `NotificationPreference.campaignsEnabled`
 * defaults to false and nothing ever asks. This module decides whether to ask
 * once, and never if they already answered at consent: the prompt appears on
 * the first client session where the preference is still off AND the client
 * never answered the marketing question on /consent, and never again after
 * they answer either way or dismiss it.
 *
 * The seen flag is per user per device, so a shared device asks each account.
 */

/** The slice of AsyncStorage this module needs — injectable for tests. */
export type OptInStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export const defaultOptInStorage: OptInStorage = AsyncStorage;

export function campaignsOptInStorageKey(userId: string): string {
  return `campaigns-opt-in-prompted:${userId}`;
}

export async function shouldShowCampaignsOptIn({
  userId,
  campaignsEnabled,
  marketingDecided,
  storage = defaultOptInStorage,
}: {
  userId: string | undefined;
  campaignsEnabled: boolean | undefined;
  /** From consent status. `undefined` while loading — never ask on a guess. */
  marketingDecided: boolean | undefined;
  storage?: OptInStorage;
}): Promise<boolean> {
  // Any input still loading, the client already opted in, or they already
  // answered the same question on /consent.
  if (!userId || campaignsEnabled !== false) return false;
  if (marketingDecided !== false) return false;

  try {
    const seen = await storage.getItem(campaignsOptInStorageKey(userId));
    return seen === null;
  } catch {
    // A storage failure must not turn a once-only prompt into every-launch.
    return false;
  }
}

export async function markCampaignsOptInSeen(
  userId: string,
  storage: OptInStorage = defaultOptInStorage,
): Promise<void> {
  try {
    await storage.setItem(campaignsOptInStorageKey(userId), "1");
  } catch {
    // Ignore local storage write issues.
  }
}
