"use client";

import { MissionDTO } from "./StatisticsBoardClient";
import { StatusBadge } from "./StatusBadge";

export function MissionActionBar({
  canEdit,
  canSubmit,
  isSaving,
  status,
  onSave,
  onSubmit,
}: {
  canEdit: boolean;
  canSubmit: boolean;
  isSaving: boolean;
  status: MissionDTO["status"];
  onSave: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mission-panel-actions">
      <button
        className="btn-secondary"
        onClick={onSave}
        disabled={isSaving || !canEdit}
      >
        {isSaving ? "저장 중..." : "임시 저장"}
      </button>
      <button
        className="btn-primary"
        onClick={onSubmit}
        disabled={isSaving || !canSubmit}
      >
        완료 — 승인 요청
      </button>
      <StatusBadge status={status} />
    </div>
  );
}
