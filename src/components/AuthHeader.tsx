"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { TeacherNotificationBell } from "./TeacherNotificationBell";

/**
 * Shows user info + logout button when authenticated via Google OAuth.
 * Mock-auth 경로는 2026-04-22 제거됨.
 */
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
        className="auth-logout-btn"
        onClick={() => signOut({ redirectTo: "/login" })}
      >
        로그아웃
      </button>
    </div>
  );
}

/**
 * Native <details>-based dropdown so teachers can jump to infrequent-but-critical
 * settings (Canva app install guide) without hunting across routes.
 */
function SettingsMenu() {
  return (
    <details className="auth-settings">
      <summary
        className="auth-settings-trigger"
        title="설정 메뉴"
        aria-label="설정 메뉴 열기"
      >
        ⚙
      </summary>
      <div className="auth-settings-panel" role="menu">
        <Link
          href="/teacher/settings"
          className="auth-settings-item"
          role="menuitem"
        >
          ⚙ 교사 설정
        </Link>
        <Link
          href="/teacher/settings#llm"
          className="auth-settings-item auth-settings-subitem"
          role="menuitem"
        >
          🤖 생성형 AI 연결
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

/**
 * Login link for unauthenticated users.
 */
export function LoginLink() {
  return (
    <Link href="/login" className="auth-login-link">
      로그인
    </Link>
  );
}
