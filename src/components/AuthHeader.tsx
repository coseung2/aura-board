"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { TeacherNotificationBell } from "./TeacherNotificationBell";

export function AuthHeader() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="auth-header">
      {session.user.image && (
        <img
          src={session.user.image}
          alt=""
          className="auth-avatar"
          width={28}
          height={28}
        />
      )}
      <span className="auth-name">{session.user.name}</span>
      <TeacherNotificationBell />
      <SettingsMenu />
      <button
        type="button"
        className="auth-logout-btn"
        onClick={() => signOut({ redirectTo: "/login" })}
        aria-label="로그아웃"
        title="로그아웃"
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
  );
}

function SettingsMenu() {
  return (
    <details className="auth-settings">
      <summary
        className="auth-settings-trigger"
        title="설정 메뉴"
        aria-label="설정 메뉴 열기"
      >
        ⚙️
      </summary>
      <div className="auth-settings-panel" role="menu">
        <Link
          href="/teacher/settings"
          className="auth-settings-item"
          role="menuitem"
        >
          ⚙️ 교사 설정
        </Link>
        <Link
          href="/teacher/settings#llm"
          className="auth-settings-item auth-settings-subitem"
          role="menuitem"
        >
          ✨ 생성형 AI 연결
        </Link>
        <Link
          href="/teacher/settings#canva"
          className="auth-settings-item auth-settings-subitem"
          role="menuitem"
        >
          🎨 Canva 연동
        </Link>
        <Link
          href="/teacher/settings#billing"
          className="auth-settings-item auth-settings-subitem"
          role="menuitem"
        >
          💳 결제·구독
        </Link>
      </div>
    </details>
  );
}

export function LoginLink() {
  return (
    <Link href="/login" className="auth-login-link">
      로그인
    </Link>
  );
}
