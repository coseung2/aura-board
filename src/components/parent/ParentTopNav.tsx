"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";

type ParentInfo = {
  name: string;
  email: string;
};

type Props = {
  parent: ParentInfo;
};

export function ParentTopNav({ parent }: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const tabs = [
    {
      id: "home",
      label: "홈",
      href: "/parent/home",
      active: pathname === "/parent/home" || pathname.startsWith("/parent/home"),
    },
    {
      id: "notifications",
      label: "알림",
      href: "/parent/notifications",
      active: pathname.startsWith("/parent/notifications"),
    },
    {
      id: "account",
      label: "계정",
      href: "/parent/account",
      active: pathname.startsWith("/parent/account"),
    },
  ];

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/parent/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      router.replace("/login");
    } catch (e) {
      console.error("[ParentTopNav] logout failed", e);
      setLoggingOut(false);
    }
  }

  return (
    <header className="parent-topnav">
      <div className="parent-topnav-left">
        <Link href="/parent/home" className="parent-topnav-logo" aria-label="학부모 홈">
          <Logo size={32} withWordmark />
        </Link>

        <nav className="parent-topnav-links" aria-label="학부모 메뉴">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`parent-topnav-link${tab.active ? " active" : ""}`}
              aria-current={tab.active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="parent-topnav-right">
        <div className="parent-topnav-user" aria-label="로그인 정보">
          <span className="parent-topnav-name">{parent.name}</span>
          <span className="parent-topnav-email">{parent.email}</span>
        </div>
        <button
          type="button"
          className="parent-topnav-logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "로그아웃 중..." : "로그아웃"}
        </button>
      </div>
    </header>
  );
}

