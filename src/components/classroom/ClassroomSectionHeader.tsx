import Link from "next/link";
import type { ReactNode } from "react";

type ClassroomSectionLink = {
  key: string;
  label: string;
  href: string;
};

export type ClassroomSectionHeaderProps = {
  classroomId: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  ariaLabel: string;
  links: Array<ClassroomSectionLink>;
  activeKey: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function ClassroomSectionHeader({
  classroomId,
  eyebrow,
  title,
  description,
  ariaLabel,
  links,
  activeKey,
  actions,
  backHref,
  backLabel = "학급 대시보드",
}: ClassroomSectionHeaderProps) {
  return (
    <header className="classroom-section-header">
      <div className="classroom-section-heading">
        <Link
          href={backHref ?? `/classroom/${classroomId}/dashboard`}
          className="classroom-back-link"
        >
          &larr; {backLabel}
        </Link>
        <p className="classroom-section-eyebrow">{eyebrow}</p>
        <h1 className="classroom-section-title">{title}</h1>
        {description !== undefined && description !== null ? (
          <p className="classroom-section-description">{description}</p>
        ) : null}
      </div>

      <nav className="classroom-section-navigation" aria-label={ariaLabel}>
        {links.map((link) => {
          const isActive = link.key === activeKey;
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

      {actions !== undefined && actions !== null ? (
        <div className="classroom-section-actions">{actions}</div>
      ) : null}
    </header>
  );
}
