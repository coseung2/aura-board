import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// 학생 세션 토큰 · 학생 프로필 캐시.
// SecureStore = 안드로이드에선 AndroidKeystore 로 AES 암호화.
// Key 이름은 짧은 ASCII 만 허용 (한글/공백 X).
const TOKEN_KEY = "aura_student_token";
const STUDENT_KEY = "aura_student_cache";

// 학부모 세션 토큰 · 프로필 캐시.
const PARENT_TOKEN_KEY = "aura_parent_token";
const PARENT_KEY = "aura_parent_cache";

function canUseWebStorage(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

async function setStoredItem(key: string, value: string): Promise<void> {
  if (canUseWebStorage()) {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getStoredItem(key: string): Promise<string | null> {
  if (canUseWebStorage()) {
    return window.localStorage.getItem(key);
  }
  return (await SecureStore.getItemAsync(key)) ?? null;
}

async function deleteStoredItem(key: string): Promise<void> {
  if (canUseWebStorage()) {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export type CachedStudent = {
  id: string;
  name: string;
  classroomId: string;
  classroom?: { id: string; name: string } | null;
};

export async function saveSessionToken(token: string): Promise<void> {
  await setStoredItem(TOKEN_KEY, token);
}

export async function loadSessionToken(): Promise<string | null> {
  return getStoredItem(TOKEN_KEY);
}

export async function clearSessionToken(): Promise<void> {
  await deleteStoredItem(TOKEN_KEY).catch(() => undefined);
  await deleteStoredItem(STUDENT_KEY).catch(() => undefined);
}

export async function saveStudentCache(student: CachedStudent): Promise<void> {
  await setStoredItem(STUDENT_KEY, JSON.stringify(student));
}

export async function loadStudentCache(): Promise<CachedStudent | null> {
  const raw = await getStoredItem(STUDENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedStudent;
  } catch {
    return null;
  }
}

// ─── 학부모 세션 ───

export type CachedParent = {
  id: string;
  name: string;
  email: string | null;
  linkedStudentIds: string[];
};

export async function saveParentToken(token: string): Promise<void> {
  await setStoredItem(PARENT_TOKEN_KEY, token);
}

export async function loadParentToken(): Promise<string | null> {
  return getStoredItem(PARENT_TOKEN_KEY);
}

export async function clearParentSession(): Promise<void> {
  await deleteStoredItem(PARENT_TOKEN_KEY).catch(() => undefined);
  await deleteStoredItem(PARENT_KEY).catch(() => undefined);
}

export async function saveParentCache(parent: CachedParent): Promise<void> {
  await setStoredItem(PARENT_KEY, JSON.stringify(parent));
}

export async function loadParentCache(): Promise<CachedParent | null> {
  const raw = await getStoredItem(PARENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedParent;
  } catch {
    return null;
  }
}
