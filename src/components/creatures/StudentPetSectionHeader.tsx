import Link from "next/link";

import styles from "./StudentPetSectionHeader.module.css";

export type StudentPetSection = "mine" | "classroom" | "shop";

type Props = {
  active: StudentPetSection;
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

export function StudentPetSectionHeader({ active }: Props) {
  return (
    <nav className={styles.navigation} aria-label="펫 메뉴">
      {PET_LINKS.map((link) => {
        const isActive = link.key === active;
        return (
          <Link
            key={link.key}
            href={link.href}
            className={isActive ? styles.active : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
