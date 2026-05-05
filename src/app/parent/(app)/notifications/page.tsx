// Stub notifications page (nav target). Weekly digest history + in-app badges
// land in v2+. For v1, just show a placeholder explaining where digests will
// appear. Session is already enforced by the (app) layout.

export const dynamic = "force-dynamic";

export default function ParentNotificationsPage() {
  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: 16,
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "var(--color-text, #111827)",
      }}
    >
      <h1 style={{ fontSize: 20, margin: "8px 0 16px" }}>알림</h1>
      <div
        style={{
          padding: 20,
          background: "var(--color-surface, #fff)",
          border: "1px dashed var(--color-border, #e5e7eb)",
          borderRadius: 12,
          color: "var(--color-text-muted, #6b7280)",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        주간 활동 요약과 교사 공지가 이곳에 표시됩니다.
      </div>
    </main>
  );
}
