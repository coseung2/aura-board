import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { StudentDuty } from "./types";

export type StudentNavTarget = {
  id: string;
  label: string;
  emoji: string;
  href: string;
  pathname: string;
};

export const studentBaseNavTargets: StudentNavTarget[] = [
  {
    id: "home",
    label: "홈",
    emoji: "⌂",
    href: "/(student)",
    pathname: "/",
  },
  {
    id: "boards",
    label: "보드",
    emoji: "▦",
    href: "/(student)/boards",
    pathname: "/boards",
  },
  {
    id: "portfolio",
    label: "포트폴리오",
    emoji: "▤",
    href: "/(student)/portfolio",
    pathname: "/portfolio",
  },
  {
    id: "reading",
    label: "독서",
    emoji: "▥",
    href: "/(student)/reading",
    pathname: "/reading",
  },
  {
    id: "walking",
    label: "걷기",
    emoji: "👣",
    href: "/(student)/walking",
    pathname: "/walking",
  },
  {
    id: "more",
    label: "더보기",
    emoji: "•••",
    href: "/(student)/more",
    pathname: "/more",
  },
];

export const studentOptionalNavTargets: StudentNavTarget[] = [
  { id: "wallet", label: "통장", emoji: "💳", href: "/(student)/wallet", pathname: "/wallet" },
  { id: "canva", label: "Canva", emoji: "🎨", href: "/(student)/canva", pathname: "/canva" },
  { id: "notifications", label: "알림", emoji: "🔔", href: "/(student)/notifications", pathname: "/notifications" },
];

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

export function studentDutyTarget(duty: StudentDuty): StudentNavTarget | null {
  const classroomId = encodeURIComponent(duty.classroomId);
  const base = {
    id: `duty:${duty.classroomId}:${duty.roleKey}`,
    label: duty.roleLabel,
    emoji: duty.emoji ?? roleEmoji(duty.roleKey),
  };

  if (duty.href.endsWith("/bank")) {
    return {
      ...base,
      href: `/(student)/bank?classroomId=${classroomId}`,
      pathname: "/bank",
    };
  }
  if (duty.href.endsWith("/pay")) {
    return {
      ...base,
      href: `/(student)/pay?classroomId=${classroomId}`,
      pathname: "/pay",
    };
  }
  if (duty.href.endsWith("/check") || duty.roleKey === "checker") {
    return {
      ...base,
      href: `/(student)/check?classroomId=${classroomId}`,
      pathname: "/check",
    };
  }
  if (duty.href.endsWith("/cleaning") || duty.roleKey === "cleaning-inspector") {
    return {
      ...base,
      href: `/(student)/cleaning?classroomId=${classroomId}`,
      pathname: "/cleaning",
    };
  }
  if (duty.href.endsWith("/shoes") || duty.roleKey === "shoe-inspector") {
    return {
      ...base,
      href: `/(student)/shoes?classroomId=${classroomId}`,
      pathname: "/shoes",
    };
  }
  return null;
}

export function roleEmoji(roleKey: string): string {
  if (roleKey === "banker") return "🏦";
  if (roleKey === "store-clerk") return "🛒";
  if (roleKey === "checker") return "✅";
  if (roleKey === "cleaning-inspector") return "🧹";
  if (roleKey === "shoe-inspector") return "👟";
  return "•";
}

export function isStudentNavTargetActive(
  target: StudentNavTarget,
  pathname: string,
): boolean {
  if (target.id === "home") return pathname === "/";
  if (target.id === "boards") return pathname === "/boards" || pathname.startsWith("/board/");
  return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
}
