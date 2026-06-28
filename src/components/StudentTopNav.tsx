"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { StudentNotificationBell } from "./StudentNotificationBell";

type Duty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

type Props = {
  studentName: string;
  classroomName: string;
  duties?: Duty[];
};

export function StudentTopNav({
  studentName,
  classroomName,
  duties = [],
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const tabs = [
    {
      id: "boards",
      label: "보드",
      href: "/student",
      active: pathname === "/student",
    },
    {
      id: "portfolio",
      label: "포트폴리오",
      href: "/student/portfolio",
      active: pathname.startsWith("/student/portfolio"),
    },
    {
      id: "showcase",
      label: "자랑해요",
      href: "/student/showcase",
      active: pathname.startsWith("/student/showcase"),
    },
    {
      id: "wallet",
      label: "통장",
      href: "/my/wallet",
      active: pathname.startsWith("/my/wallet"),
    },
  ];

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/student/logout", { method: "POST" });
      router.push("/student/login");
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header className="student-topnav">
      <div className="student-topnav-left">
        <Link href="/student" className="student-topnav-logo" aria-label="학생 홈">
          <Logo size={32} withWordmark />
        </Link>

        <nav className="student-topnav-links" aria-label="학생 메뉴">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`student-topnav-link${tab.active ? " active" : ""}`}
              aria-current={tab.active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}

          {duties.map((duty) => {
            const active = pathname.startsWith(duty.href);
            return (
              <Link
                key={`${duty.classroomId}-${duty.roleKey}`}
                href={duty.href}
                className={`student-topnav-link student-topnav-duty${
                  active ? " active" : ""
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span aria-hidden="true">{duty.emoji ?? "•"}</span>
                {duty.roleLabel}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="student-topnav-right auth-header">
        <span className="auth-name" title={classroomName}>
          {studentName}
        </span>
        <StudentNotificationBell />
        <button
          type="button"
          className="auth-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="로그아웃"
          title={loggingOut ? "로그아웃 중..." : "로그아웃"}
        >
          <svg
            className="auth-logout-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M10 6H6.8A1.8 1.8 0 0 0 5 7.8v8.4A1.8 1.8 0 0 0 6.8 18H10" />
            <path d="M14 8l4 4-4 4" />
            <path d="M8.5 12H18" />
          </svg>
        </button>
      </div>
    </header>
  );
}
