import Link from "next/link";
import type { ReactNode } from "react";

export type AdminFeatureKey =
  | "overview"
  | "errors"
  | "activity"
  | "daily-banners";

type Props = {
  eyebrow: string;
  description: ReactNode;
  active: AdminFeatureKey;
};

const FEATURE_LINKS: Array<{
  key: AdminFeatureKey;
  label: string;
  href: string;
}> = [
  { key: "overview", label: "운영 현황", href: "/admin" },
  { key: "errors", label: "에러 로그", href: "/admin/errors" },
  { key: "activity", label: "보드 활동", href: "/admin/activity" },
  { key: "daily-banners", label: "일일 배너", href: "/admin/daily-banners" },
];

export function AdminFeatureHeader({ eyebrow, description, active }: Props) {
  return (
    <header className="admin-feature-header">
      <div>
        <Link href="/dashboard" className="admin-back-link">
          &larr; 대시보드
        </Link>
        <p className="admin-feature-eyebrow">{eyebrow}</p>
        <h1 className="admin-feature-title">관리자</h1>
        <p className="admin-feature-description">{description}</p>
      </div>
      <nav className="admin-feature-switcher" aria-label="관리자 메뉴">
        {FEATURE_LINKS.map((link) => {
          const isActive = link.key === active;
          return (
            <Link
              key={link.key}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
