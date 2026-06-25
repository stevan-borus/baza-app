import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_STORAGE_KEY = "@baza/device-id";

/**
 * Returns a stable, per-install device identifier.
 *
 * SDK 56 removed `Constants.installationId`, which used to provide this. Without a
 * stable id, every install collapsed to the same literal and collided on the
 * globally unique `expoPushToken` constraint.
 *
 * We generate a UUID once and persist it in AsyncStorage. A persisted UUID is the
 * most robust choice here: it can never be null, can never collide across devices,
 * and is stable across launches and app updates. We deliberately do NOT use the
 * native IDFV / Android ID — those have documented edge cases (IDFV can return null
 * or an all-zeros UUID; Android ID rotates on signing-key change / factory reset),
 * and their one advantage (surviving a reinstall) is irrelevant for push tokens: a
 * reinstall yields a fresh Expo token anyway, and the server reclaims tokens that
 * move between installs.
 */
export async function getStableDeviceId(): Promise<string> {
  const cached = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (cached) return cached;

  const deviceId = generateUuid();
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

/**
 * RFC 4122 v4-shaped UUID without a native crypto dependency. Generated exactly
 * once per install and persisted, so it only needs to be unique across devices —
 * Math.random() is sufficient for that, and we never call it on a hot path.
 */
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
