"use client";

import { MissionDTO } from "./StatisticsBoardClient";

const statusConfig: Record<
  MissionDTO["status"],
  { label: string; className: string; style?: React.CSSProperties }
> = {
  not_started: {
    label: "\u2B1C 시작 전",
    className: "not_started",
    style: { background: "#f5f5f5", color: "#616161" },
  },
  in_progress: {
    label: "\u1F7E1 수정 중",
    className: "in_progress",
    style: { background: "#fffde7", color: "#f9a825" },
  },
  pending_approval: {
    label: "승인 요청",
    className: "pending",
  },
  approved: {
    label: "승인 완료",
    className: "approved",
  },
  teacher_working: {
    label: "교사 제작 중",
    className: "teacher_working",
    style: { background: "#f3e5f5", color: "#7b1fa2" },
  },
  completed: {
    label: "완료 \u2705",
    className: "completed",
    style: { background: "#e3f2fd", color: "#1565c0" },
  },
};

export function StatusBadge({ status }: { status: MissionDTO["status"] }) {
  const config = statusConfig[status];
  return (
    <span
      className={`status-badge ${config.className}`}
      style={config.style}
    >
      {config.label}
    </span>
  );
}
