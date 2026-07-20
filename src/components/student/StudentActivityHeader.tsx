import Link from "next/link";

export type StudentActivityKey = "walking" | "reading";

type Props = {
  active: StudentActivityKey;
};

const ACTIVITY_LINKS: Array<{
  key: StudentActivityKey;
  label: string;
  href: string;
}> = [
  { key: "walking", label: "걷기", href: "/student/walking" },
  { key: "reading", label: "독서", href: "/student/reading" },
];

/** Shared student self-directed activity heading and local navigation. */
export function StudentActivityHeader({ active }: Props) {
  const activeLabel = ACTIVITY_LINKS.find((link) => link.key === active)?.label;

  return (
    <header className="student-activity-header">
      <div className="student-activity-heading">
        <p className="student-activity-eyebrow">자율활동</p>
        <h1 className="student-activity-title">{activeLabel}</h1>
      </div>

      <nav className="student-activity-navigation" aria-label="자율활동">
        {ACTIVITY_LINKS.map((link) => {
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
