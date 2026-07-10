"use client";

import type {
  ColumnsPresenceSummary,
  ColumnsRealtimeStatus as RealtimeStatus,
} from "@/lib/columns-presence";

type Props = {
  status: RealtimeStatus;
  presence: ColumnsPresenceSummary;
};

export function ColumnsRealtimeStatus({ status, presence }: Props) {
  if (status === "unavailable") return null;

  const live = status === "live";
  const onlineCount = live ? Math.max(1, presence.onlineCount) : 0;
  const statusLabel = live
    ? `동시 접속 ${onlineCount}`
    : status === "connecting"
      ? "실시간 연결 중"
      : "실시간 재연결 중";
  const workingLabel =
    live && presence.remoteWorkingCount > 0
      ? ` · 다른 사용자 ${presence.remoteWorkingCount}명 작업 중`
      : "";
  const titleParts = [statusLabel];
  if (presence.remoteActiveSectionCount > 0) {
    titleParts.push(
      `다른 사용자가 ${presence.remoteActiveSectionCount}개 주제에서 활동 중`,
    );
  }
  if (presence.remoteEditingCount > 0) {
    titleParts.push(`카드·주제 편집 ${presence.remoteEditingCount}명`);
  }
  if (presence.remoteAddingCount > 0) {
    titleParts.push(`카드 추가 ${presence.remoteAddingCount}명`);
  }
  if (presence.remoteDraggingCount > 0) {
    titleParts.push(`이동·정렬 ${presence.remoteDraggingCount}명`);
  }

  return (
    <div
      aria-live="polite"
      title={titleParts.join(" · ")}
      style={{
        position: "absolute",
        top: 6,
        right: 32,
        zIndex: 6,
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "0 10px",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-pill)",
        background: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
        boxShadow: "var(--shadow-card)",
        color: "var(--color-text-muted)",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          marginRight: 7,
          borderRadius: "50%",
          background: live
            ? "var(--color-success, #16a34a)"
            : "var(--color-warning, #d97706)",
          boxShadow: live
            ? "0 0 0 3px color-mix(in srgb, var(--color-success, #16a34a) 18%, transparent)"
            : "none",
        }}
      />
      <span>{statusLabel}</span>
      {workingLabel && (
        <span style={{ color: "var(--color-text)" }}>{workingLabel}</span>
      )}
    </div>
  );
}
