import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const WEB_PREFIX = "aura_mobile_cache:";
let fileOperation: Promise<void> = Promise.resolve();

function canUseWebStorage(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function fileUri(key: string): string | null {
  return FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${encodeURIComponent(key)}.json`
    : null;
}

/** Read non-secret UI cache data from the app sandbox. */
export async function readPersistentJson<T>(key: string): Promise<T | null> {
  try {
    if (canUseWebStorage()) {
      const raw = window.localStorage.getItem(`${WEB_PREFIX}${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    }

    const uri = fileUri(key);
    if (!uri) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Serialize writes and removals so a logout clear cannot race an older write.
 * Cache persistence is best-effort and must never block rendering or logout.
 */
export function writePersistentJson(key: string, value: unknown): Promise<void> {
  fileOperation = fileOperation
    .catch(() => undefined)
    .then(async () => {
      const raw = JSON.stringify(value);
      if (canUseWebStorage()) {
        window.localStorage.setItem(`${WEB_PREFIX}${key}`, raw);
        return;
      }

      const uri = fileUri(key);
      if (uri) await FileSystem.writeAsStringAsync(uri, raw);
    })
    .catch(() => undefined);
  return fileOperation;
}

export function removePersistentJson(key: string): Promise<void> {
  fileOperation = fileOperation
    .catch(() => undefined)
    .then(async () => {
      if (canUseWebStorage()) {
        window.localStorage.removeItem(`${WEB_PREFIX}${key}`);
        return;
      }

      const uri = fileUri(key);
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
    })
    .catch(() => undefined);
  return fileOperation;
}
