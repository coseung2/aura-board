import Link from "next/link";

import type { StudentActivityKey } from "@/components/student/StudentActivityHeader";

import styles from "./page.module.css";

const ACTIVITIES: ReadonlyArray<{
  key: StudentActivityKey;
  label: string;
}> = [
  { key: "reading", label: "독서" },
  { key: "walking", label: "걷기" },
];

export function SelfDirectedSectionTabs({
  active,
}: {
  active: StudentActivityKey;
}) {
  return (
    <nav className={styles.sectionTabs} aria-label="자율활동 영역">
      {ACTIVITIES.map((activity) => (
        <Link
          key={activity.key}
          href={`/student/${activity.key}`}
          className={styles.sectionTab}
          aria-current={active === activity.key ? "page" : undefined}
        >
          {activity.label}
        </Link>
      ))}
    </nav>
  );
}
