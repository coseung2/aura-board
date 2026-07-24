import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { clearBoardCache } from "./board-cache";

// 학생 세션 토큰 · 학생 프로필 캐시.
// SecureStore = 안드로이드에선 AndroidKeystore 로 AES 암호화.
// Key 이름은 짧은 ASCII 만 허용 (한글/공백 X).
const TOKEN_KEY = "aura_student_token";
const STUDENT_KEY = "aura_student_cache";

// 학부모 세션 토큰 · 프로필 캐시.
const PARENT_TOKEN_KEY = "aura_parent_token";
const PARENT_KEY = "aura_parent_cache";
const PARENT_SELECTED_CHILD_KEY = "aura_parent_selected_child";
const parentSelectedChildListeners = new Set<
  (studentId: string | null) => void
>();
let logoutInProgressRole: UnifiedLoginRole | null = null;

export type UnifiedLoginRole = "student" | "parent";
export type UnifiedLoginRoute =
  | `/login?role=${UnifiedLoginRole}`
  | `/login?role=${UnifiedLoginRole}&error=${string}`;

/**
 * Keep auth failures and explicit logout navigation on a dedicated top-level
 * route. Using `/` for both boot restoration and logout allowed nested group
 * indexes to remain active while the login UI was being mounted.
 */
export function getUnifiedLoginRoute(
  role: UnifiedLoginRole,
  error?: string,
): UnifiedLoginRoute {
  const base: `/login?role=${UnifiedLoginRole}` = `/login?role=${role}`;
  return error
    ? (`${base}&error=${encodeURIComponent(error)}` as UnifiedLoginRoute)
    : base;
}

/**
 * Mark an explicit logout before any async storage work starts. The root login
 * screen uses this marker to suppress session restoration while nested screens
 * are unmounting.
 */
export function startStudentLogout(): void {
  logoutInProgressRole = "student";
}

export function startParentLogout(): void {
  logoutInProgressRole = "parent";
}

export function isParentLogoutInProgress(): boolean {
  return logoutInProgressRole === "parent";
}

export function getLogoutInProgressRole(): UnifiedLoginRole | null {
  return logoutInProgressRole;
}

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
  // A login/token replacement starts a new auth scope. Never let a previous
  // student's in-memory board data survive that boundary.
  logoutInProgressRole = null;
  clearBoardCache();
  await setStoredItem(TOKEN_KEY, token);
}

export async function loadSessionToken(): Promise<string | null> {
  return getStoredItem(TOKEN_KEY);
}

export async function clearSessionToken(): Promise<void> {
  clearBoardCache();
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
  logoutInProgressRole = null;
  await setStoredItem(PARENT_TOKEN_KEY, token);
}

export async function loadParentToken(): Promise<string | null> {
  return getStoredItem(PARENT_TOKEN_KEY);
}

export async function clearParentSession(): Promise<void> {
  await deleteStoredItem(PARENT_TOKEN_KEY).catch(() => undefined);
  await deleteStoredItem(PARENT_KEY).catch(() => undefined);
  await deleteStoredItem(PARENT_SELECTED_CHILD_KEY).catch(() => undefined);
  notifyParentSelectedChild(null);
}

/**
 * Explicit logout exits the unified mobile login scope, not just the currently
 * visible role. Clearing both role caches prevents the landing screen (or the
 * next cold start) from restoring a stale session for the other role.
 */
export async function clearAllMobileSessions(): Promise<void> {
  clearBoardCache();
  await Promise.all([
    deleteStoredItem(TOKEN_KEY).catch(() => undefined),
    deleteStoredItem(STUDENT_KEY).catch(() => undefined),
    deleteStoredItem(PARENT_TOKEN_KEY).catch(() => undefined),
    deleteStoredItem(PARENT_KEY).catch(() => undefined),
    deleteStoredItem(PARENT_SELECTED_CHILD_KEY).catch(() => undefined),
  ]);
  notifyParentSelectedChild(null);
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

export async function saveParentSelectedChild(studentId: string): Promise<void> {
  await setStoredItem(PARENT_SELECTED_CHILD_KEY, studentId);
  notifyParentSelectedChild(studentId);
}

export async function loadParentSelectedChild(): Promise<string | null> {
  return getStoredItem(PARENT_SELECTED_CHILD_KEY);
}

export function subscribeParentSelectedChild(
  listener: (studentId: string | null) => void,
): () => void {
  parentSelectedChildListeners.add(listener);
  return () => parentSelectedChildListeners.delete(listener);
}

function notifyParentSelectedChild(studentId: string | null): void {
  for (const listener of parentSelectedChildListeners) {
    try {
      listener(studentId);
    } catch {
      // A mounted screen listener must never prevent session cleanup/logout.
    }
  }
}
