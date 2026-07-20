import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./StudentPetSectionHeader.module.css";

export type StudentPetSection = "mine" | "classroom";

type Props = {
  active: StudentPetSection;
  actions?: ReactNode;
  description?: ReactNode;
};

const PET_LINKS: Array<{
  key: StudentPetSection;
  label: string;
  href: string;
}> = [
  { key: "mine", label: "내 펫", href: "/student/aura-pet" },
  {
    key: "classroom",
    label: "우리 반 펫",
    href: "/student/aura-pet/classroom",
  },
];

const SECTION_COPY: Record<
  StudentPetSection,
  { eyebrow: string; title: string }
> = {
  mine: { eyebrow: "MY PET", title: "내 펫" },
  classroom: { eyebrow: "CLASS PETS", title: "우리 반 펫" },
};

export function StudentPetSectionHeader({
  active,
  actions,
  description,
}: Props) {
  const copy = SECTION_COPY[active];

  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className={styles.title}>{copy.title}</h1>
        {description !== undefined && description !== null ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </div>

      <nav className={styles.navigation} aria-label="펫 메뉴">
        {PET_LINKS.map((link) => {
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

      {actions !== undefined && actions !== null ? (
        <div className={styles.actions}>{actions}</div>
      ) : null}
    </header>
  );
}
