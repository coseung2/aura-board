"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TeacherNotificationBell } from "./TeacherNotificationBell";
import { ChevronDownIcon } from "./icons/UiIcons";
import { RoleIcon } from "./login/RoleIcon";

export function AuthHeader() {
  const { data: session, status } = useSession();
  const [canSwitchToParent, setCanSwitchToParent] = useState(false);
  const [switchingToParent, setSwitchingToParent] = useState(false);
  const roleMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadParentSession() {
      try {
        const res = await fetch("/api/parent/session/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { canSwitchToParent?: boolean };
        if (!cancelled) setCanSwitchToParent(Boolean(data.canSwitchToParent));
      } catch {
        /* parent session is optional */
      }
    }
    void loadParentSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canSwitchToParent) return;
    const menu = roleMenuRef.current;
    if (!menu) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) menu.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.open) return;
      menu.open = false;
      menu.querySelector<HTMLElement>("summary")?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [canSwitchToParent]);

  if (status === "loading") {
    return null;
  }

  if (!session?.user) {
    return null;
  }

  async function switchToParent() {
    if (switchingToParent) return;
    setSwitchingToParent(true);
    try {
      const res = await fetch("/api/parent/session/switch", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as {
        redirect?: string;
      } | null;
      if (!res.ok || !data?.redirect) throw new Error("parent_switch_failed");
      window.location.assign(data.redirect);
    } catch {
      setSwitchingToParent(false);
    }
  }

  return (
    <div className="auth-header auth-header-teacher">
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
      {canSwitchToParent && (
        <details ref={roleMenuRef} className="auth-role-menu">
          <summary className="auth-role-trigger" aria-label="사용자 유형 전환">
            <span className="auth-role-trigger-content">
              <span className="auth-role-icon"><RoleIcon role="teacher" /></span>
              <span>교사</span>
              <ChevronDownIcon size={14} className="auth-role-chevron" />
            </span>
          </summary>
          <div className="auth-role-menu-panel" role="menu" aria-label="사용자 유형">
            <span className="auth-role-option is-current" role="menuitem" aria-current="page">
              <span className="auth-role-icon"><RoleIcon role="teacher" /></span>
              <span>교사</span>
            </span>
            <button
              type="button"
              className="auth-role-option auth-role-option-button"
              role="menuitem"
              onClick={switchToParent}
              disabled={switchingToParent}
            >
              <span className="auth-role-icon"><RoleIcon role="parent" /></span>
              <span>{switchingToParent ? "전환 중…" : "학부모"}</span>
            </button>
          </div>
        </details>
      )}
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
    <Link href="/teacher/settings" className="auth-settings">
      <span
        className="auth-settings-trigger"
        title="교사 설정"
        aria-label="교사 설정으로 이동"
      >
        ⚙️
      </span>
    </Link>
  );
}

export function LoginLink() {
  return (
    <Link href="/login" className="auth-login-link">
      로그인
    </Link>
  );
}
