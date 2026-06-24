"use client";

import { useEffect, useState } from "react";
import {
  GroupRosterEditor,
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./GroupRosterEditor";

type Props = {
  classroomId: string;
  classroomName: string;
  students: GroupEditorStudent[];
  renaming: boolean;
  renameErr: string | null;
  onRename: (next: string) => void;
  onClose: () => void;
  onRequestDelete: () => void;
};

function defaultGroups(students: GroupEditorStudent[]): GroupEditorDraft[] {
  const count = Math.max(1, Math.min(4, students.length || 1));
  const groups = Array.from({ length: count }, (_, index) => ({
    name: `${index + 1}모둠`,
    studentIds: [] as string[],
  }));
  students.forEach((student, index) => {
    groups[index % count].studentIds.push(student.id);
  });
  return groups;
}

export function ClassroomSettingsModal({
  classroomId,
  classroomName,
  students,
  renaming,
  renameErr,
  onRename,
  onClose,
  onRequestDelete,
}: Props) {
  const [groups, setGroups] = useState<GroupEditorDraft[]>(() =>
    defaultGroups(students),
  );
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsSaving, setGroupsSaving] = useState(false);
  const [groupsStatus, setGroupsStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadGroups() {
      setGroupsLoading(true);
      setGroupsStatus("");
      try {
        const res = await fetch(`/api/classroom/${classroomId}/groups`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { groups: GroupEditorDraft[] };
        if (!cancelled) {
          setGroups(
            data.groups.length > 0 ? data.groups : defaultGroups(students),
          );
        }
      } catch {
        if (!cancelled) setGroupsStatus("모둠 설정을 불러오지 못했어요.");
      } finally {
        if (!cancelled) setGroupsLoading(false);
      }
    }
    void loadGroups();
    return () => {
      cancelled = true;
    };
  }, [classroomId, students]);

  async function saveGroups() {
    setGroupsSaving(true);
    setGroupsStatus("");
    try {
      const res = await fetch(`/api/classroom/${classroomId}/groups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { groups: GroupEditorDraft[] };
      setGroups(data.groups);
      setGroupsStatus("기본 모둠을 저장했어요.");
    } catch {
      setGroupsStatus("기본 모둠 저장에 실패했어요.");
    } finally {
      setGroupsSaving(false);
    }
  }

  const groupBusy = groupsLoading || groupsSaving;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="학급 설정"
    >
      <div className="classroom-settings-modal">
        <header className="classroom-settings-modal-header">
          <h3>학급 설정</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div className="classroom-settings-modal-body">
          <div className="classroom-setting-row">
            <label
              className="classroom-setting-label"
              htmlFor="classroom-name-input"
            >
              학급 이름
            </label>
            <div className="classroom-setting-name-row">
              <input
                id="classroom-name-input"
                className="classroom-setting-input"
                type="text"
                defaultValue={classroomName}
                maxLength={100}
                onBlur={(e) => {
                  if (e.target.value.trim() !== classroomName) {
                    onRename(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                disabled={renaming}
              />
              {renaming && (
                <span className="classroom-setting-saving">저장 중...</span>
              )}
            </div>
            {renameErr && (
              <p className="classroom-setting-err">
                이름 저장 실패: {renameErr}
              </p>
            )}
          </div>

          <div className="classroom-setting-row">
            <div className="classroom-setting-heading-row">
              <div>
                <p className="classroom-setting-label">기본 모둠</p>
                <p className="classroom-setting-hint">
                  새 보드를 만들 때 이 모둠이 복사됩니다. 이미 만들어진 보드와
                  섹션 모둠활동은 바뀌지 않습니다.
                </p>
              </div>
              <button
                type="button"
                className="modal-btn-submit"
                onClick={() => void saveGroups()}
                disabled={groupBusy}
              >
                {groupsSaving ? "저장 중..." : "저장"}
              </button>
            </div>
            {groupsLoading ? (
              <p className="classroom-setting-hint">불러오는 중...</p>
            ) : (
              <GroupRosterEditor
                students={students}
                groups={groups}
                onChange={setGroups}
                disabled={groupBusy}
              />
            )}
            {groupsStatus && (
              <p className="classroom-setting-hint">{groupsStatus}</p>
            )}
          </div>

          <div className="classroom-setting-row classroom-setting-danger">
            <div>
              <p className="classroom-setting-label">학급 삭제</p>
              <p className="classroom-setting-hint">
                삭제하면 연결된 학부모 접근이 해제되고 학생 계정이
                비활성화됩니다. 되돌릴 수 없습니다.
              </p>
            </div>
            <button
              type="button"
              className="classroom-detail-delete"
              onClick={onRequestDelete}
            >
              학급 삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
