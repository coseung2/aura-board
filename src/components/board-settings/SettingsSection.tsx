import type { ReactNode } from "react";

export function SettingsSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="board-settings-section"
      aria-labelledby={`settings-${title}`}
    >
      <div className="board-settings-section-head">
        <h3 id={`settings-${title}`} className="board-settings-section-title">
          {title}
        </h3>
        {actions && <div className="board-settings-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
