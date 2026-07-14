import Link from "next/link";
import type { ReactNode } from "react";

export type ClassroomFeatureKey = "walking" | "daily-banners" | "reading";

type Props = {
  classroomId: string;
  eyebrow: string;
  description: ReactNode;
  active: ClassroomFeatureKey;
};

const FEATURE_LINKS: Array<{
  key: ClassroomFeatureKey;
  label: string;
  path: string;
}> = [
  { key: "walking", label: "걷기 현황", path: "walking" },
  { key: "daily-banners", label: "배너 관리", path: "daily-banners" },
  { key: "reading", label: "독서", path: "reading" },
];

export function ClassroomFeatureHeader({
  classroomId,
  eyebrow,
  description,
  active,
}: Props) {
  const basePath = `/classroom/${classroomId}`;

  return (
    <header className="classroom-feature-header">
      <div>
        <Link href={`${basePath}/dashboard`} className="classroom-back-link">
          &larr; 학급 대시보드
        </Link>
        <p className="classroom-feature-eyebrow">{eyebrow}</p>
        <h1 className="classroom-page-title">기타 활동</h1>
        <p className="classroom-feature-description">{description}</p>
      </div>
      <nav className="classroom-feature-switcher" aria-label="기타 활동">
        {FEATURE_LINKS.map((link) => {
          const href = `${basePath}/${link.path}`;
          const isActive = link.key === active;
          return (
            <Link
              key={link.key}
              href={href}
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
