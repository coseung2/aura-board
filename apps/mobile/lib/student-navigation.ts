import type { Href } from "expo-router";
import type { StudentDuty } from "./types";

export type StudentNavTarget = {
  id: string;
  label: string;
  emoji: string;
  href: Href;
  pathname: string;
};

export const studentBaseNavTargets: StudentNavTarget[] = [
  {
    id: "boards",
    label: "보드",
    emoji: "▦",
    href: "/(student)" as Href,
    pathname: "/",
  },
  {
    id: "portfolio",
    label: "포트폴리오",
    emoji: "🗂️",
    href: "/(student)/portfolio" as Href,
    pathname: "/portfolio",
  },
  {
    id: "showcase",
    label: "자랑해요",
    emoji: "🌟",
    href: "/(student)/showcase" as Href,
    pathname: "/showcase",
  },
  {
    id: "wallet",
    label: "통장",
    emoji: "💳",
    href: "/(student)/wallet" as Href,
    pathname: "/wallet",
  },
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
      href: `/(student)/bank?classroomId=${classroomId}` as Href,
      pathname: "/bank",
    };
  }
  if (duty.href.endsWith("/pay")) {
    return {
      ...base,
      href: `/(student)/pay?classroomId=${classroomId}` as Href,
      pathname: "/pay",
    };
  }
  if (duty.href.endsWith("/check") || duty.roleKey === "checker") {
    return {
      ...base,
      href: `/(student)/check?classroomId=${classroomId}` as Href,
      pathname: "/check",
    };
  }
  return null;
}

export function roleEmoji(roleKey: string): string {
  if (roleKey === "banker") return "🏦";
  if (roleKey === "store-clerk") return "🛒";
  if (roleKey === "checker") return "✅";
  return "•";
}

export function isStudentNavTargetActive(
  target: StudentNavTarget,
  pathname: string,
): boolean {
  if (target.id === "boards") {
    return pathname === "/" || pathname.startsWith("/board/");
  }
  return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
}
