/**
 * Hook returning the locally-persisted avatar URI (image picked from the
 * device's photo library) and a setter that updates both state and storage.
 *
 * Local-only for now — server upload + a canonical user.avatarUrl field is
 * a follow-up. Every avatar surface in the app reads from this hook so a
 * picked image shows up everywhere immediately.
 *
 * Subscribers across components stay in sync because we keep an in-process
 * Set of setState callbacks and broadcast to all of them when the URI
 * changes. (AsyncStorage doesn't emit change events.)
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AVATAR_STORAGE_KEY = "baza.avatar.localUri";

const subscribers = new Set<(uri: string | null) => void>();
let cachedUri: string | null = null;
let hasLoaded = false;

function broadcast(uri: string | null) {
  cachedUri = uri;
  for (const cb of subscribers) cb(uri);
}

export function useLocalAvatar(): {
  avatarUri: string | null;
  setAvatarUri: (uri: string | null) => void;
} {
  const [avatarUri, setLocal] = useState<string | null>(cachedUri);

  useEffect(() => {
    subscribers.add(setLocal);
    if (!hasLoaded) {
      hasLoaded = true;
      AsyncStorage.getItem(AVATAR_STORAGE_KEY)
        .then((uri) => {
          if (uri) broadcast(uri);
        })
        .catch(() => {});
    }
    return () => {
      subscribers.delete(setLocal);
    };
  }, []);

  function setAvatarUri(uri: string | null) {
    broadcast(uri);
    if (uri) {
      AsyncStorage.setItem(AVATAR_STORAGE_KEY, uri).catch(() => {});
    } else {
      AsyncStorage.removeItem(AVATAR_STORAGE_KEY).catch(() => {});
    }
  }

  return { avatarUri, setAvatarUri };
}
