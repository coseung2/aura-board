import type { ReactNode } from "react";

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="board-settings-section"
      aria-labelledby={`settings-${title}`}
    >
      <h3 id={`settings-${title}`} className="board-settings-section-title">
        {title}
      </h3>
      {children}
    </section>
  );
}
