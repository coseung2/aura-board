import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export {
  isStudentNavTargetActive,
  roleEmoji,
  studentBaseNavTargets,
  studentDutyTarget,
  studentOptionalNavTargets,
} from "./student-navigation-core";
export type { StudentNavTarget } from "./student-navigation-core";

const NAV_PREFERENCES_KEY = "aura_student_nav_preferences_v1";
const preferenceListeners = new Set<(ids: string[]) => void>();

async function readPreferenceValue(): Promise<string | null> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.localStorage.getItem(NAV_PREFERENCES_KEY);
  }
  return SecureStore.getItemAsync(NAV_PREFERENCES_KEY);
}

export async function loadStudentNavPreferences(): Promise<string[]> {
  const raw = await readPreferenceValue();
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function saveStudentNavPreferences(ids: string[]): Promise<void> {
  const value = JSON.stringify(ids);
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.localStorage.setItem(NAV_PREFERENCES_KEY, value);
  } else {
    await SecureStore.setItemAsync(NAV_PREFERENCES_KEY, value);
  }
  preferenceListeners.forEach((listener) => listener(ids));
}

export function subscribeStudentNavPreferences(listener: (ids: string[]) => void) {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}
