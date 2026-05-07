"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  key: string;
  label: string;
  emoji: string;
};

const TABS: Tab[] = [
  { key: "students", label: "학생 명단", emoji: "👥" },
  { key: "boards", label: "학급 보드", emoji: "🧩" },
  { key: "roles", label: "학급 역할", emoji: "🪪" },
  { key: "bank", label: "은행", emoji: "🏦" },
  { key: "store", label: "매점", emoji: "🏪" },
  { key: "pay", label: "결제", emoji: "QR" },
];

type Props = {
  classroomId: string;
};

export function ClassroomNav({ classroomId }: Props) {
  const pathname = usePathname() ?? "";
  const basePath = `/classroom/${classroomId}`;

  return (
    <nav className="classroom-nav" aria-label="학급 관리 섹션">
      {TABS.map((tab) => {
        const href = `${basePath}/${tab.key}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.key}
            href={href}
            className={`classroom-nav-tab ${isActive ? "is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="classroom-nav-emoji" aria-hidden="true">
              {tab.emoji}
            </span>
            <span className="classroom-nav-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
