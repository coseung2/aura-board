import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { studentBaseNavTargets } from "./student-navigation-core";

export {
  isStudentNavTargetActive,
  roleEmoji,
  studentBaseNavTargets,
  studentDutyTarget,
  studentOptionalNavTargets,
} from "./student-navigation-core";
export type { StudentNavTarget } from "./student-navigation-core";

const NAV_PREFERENCES_KEY = "aura_student_nav_preferences_v1";
const MORE_NAV_ID = "more";
const preferenceListeners = new Set<(ids: string[]) => void>();

export function normalizeStudentNavIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = [
    ...new Set(value.filter((id): id is string => typeof id === "string")),
  ];
  // Keep the entry point to the full menu after every enabled tab.
  const moreIndex = ids.indexOf(MORE_NAV_ID);
  if (moreIndex < 0) return ids;
  ids.splice(moreIndex, 1);
  ids.push(MORE_NAV_ID);
  return ids;
}

function legacyDefaultIds() {
  return normalizeStudentNavIds(
    studentBaseNavTargets.map((target) => target.id),
  );
}

async function readPreferenceValue(): Promise<string | null> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.localStorage.getItem(NAV_PREFERENCES_KEY);
  }
  return SecureStore.getItemAsync(NAV_PREFERENCES_KEY);
}

export async function loadStudentNavPreferences(): Promise<string[]> {
  const raw = await readPreferenceValue();
  if (!raw) return legacyDefaultIds();
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) {
      // v1 only stored optional menu IDs. Keep the former fixed menu items.
      return normalizeStudentNavIds([...legacyDefaultIds(), ...value]);
    }
    if (value && typeof value === "object" && "ids" in value) {
      return normalizeStudentNavIds(value.ids);
    }
    return legacyDefaultIds();
  } catch {
    return legacyDefaultIds();
  }
}

export async function saveStudentNavPreferences(ids: string[]): Promise<void> {
  const normalizedIds = normalizeStudentNavIds(ids);
  const value = JSON.stringify({ version: 2, ids: normalizedIds });
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.localStorage.setItem(NAV_PREFERENCES_KEY, value);
  } else {
    await SecureStore.setItemAsync(NAV_PREFERENCES_KEY, value);
  }
  preferenceListeners.forEach((listener) => listener(normalizedIds));
}

export function subscribeStudentNavPreferences(listener: (ids: string[]) => void) {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}
