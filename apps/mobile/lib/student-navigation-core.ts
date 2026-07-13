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
  if (target.id === "more") {
    return pathname === "/more" || pathname.startsWith("/more/") || pathname === "/daily-banner-submit";
  }
  return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
}
