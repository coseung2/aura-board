"use client";

import type { MissionDTO } from "./StatisticsBoardClient";
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
        {isSaving ? "저장하고 있어요..." : "잠깐 저장"}
      </button>
      <button
        className="btn-primary"
        onClick={onSubmit}
        disabled={isSaving || !canSubmit}
      >
        선생님께 보내기
      </button>
      <StatusBadge status={status} />
    </div>
  );
}
