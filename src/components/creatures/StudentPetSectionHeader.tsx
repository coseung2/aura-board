import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./StudentPetSectionHeader.module.css";

export type StudentPetSection = "mine" | "classroom" | "shop";

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
  { key: "mine", label: "내 펫", href: "/student/aura-pet?section=mine" },
  {
    key: "classroom",
    label: "우리 반 펫",
    href: "/student/aura-pet?section=classroom",
  },
  { key: "shop", label: "상점", href: "/student/aura-pet?section=shop" },
];

export function StudentPetSectionHeader({
  active,
  actions,
  description,
}: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <h1 className={styles.title}>펫</h1>
        {description !== undefined && description !== null ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </div>

      {actions !== undefined && actions !== null ? (
        <div className={styles.actions}>{actions}</div>
      ) : null}

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
    </header>
  );
}
