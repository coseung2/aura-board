"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  GroupRosterEditor,
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "../classroom/GroupRosterEditor";
import type { BreakoutState, StreamSection } from "./stream-board-model";

function groupsFromBreakoutState(
  state: BreakoutState | undefined,
): GroupEditorDraft[] {
  if (!state?.groups.length) return defaultBreakoutGroups([]);
  return [...state.groups]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      name: group.name,
      studentIds: (group.members ?? []).map((member) => member.studentId),
    }));
}

function studentsFromBreakoutState(
  state: BreakoutState | undefined,
): GroupEditorStudent[] {
  const byId = new Map<string, GroupEditorStudent>();
  for (const group of state?.groups ?? []) {
    for (const member of group.members ?? []) {
      byId.set(member.studentId, {
        id: member.studentId,
        name: member.studentName,
        number: member.studentNumber,
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.number == null && b.number == null) return a.name.localeCompare(b.name);
    if (a.number == null) return 1;
    if (b.number == null) return -1;
    return a.number - b.number;
  });
}

function defaultBreakoutGroups(
  students: GroupEditorStudent[],
): GroupEditorDraft[] {
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

export function BreakoutConfigModal({
  boardId,
  section,
  state,
  busy,
  onClose,
  onSave,
  onDisable,
}: {
  boardId: string;
  section: StreamSection;
  state: BreakoutState | undefined;
  busy: boolean;
  onClose: () => void;
  onSave: (groups: GroupEditorDraft[]) => Promise<boolean>;
  onDisable: () => Promise<boolean>;
}) {
  const [students, setStudents] = useState<GroupEditorStudent[]>([]);
  const [groups, setGroups] = useState<GroupEditorDraft[]>(() =>
    groupsFromBreakoutState(state),
  );
  const [loading, setLoading] = useState(!state?.config);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      await onSave(groups);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadDefaults() {
      setLoading(true);
      setStatus("");
      try {
        const res = await fetch(`/api/boards/${boardId}/default-groups`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          students: GroupEditorStudent[];
          groups: GroupEditorDraft[];
        };
        if (!cancelled) {
          setStudents(data.students ?? []);
          setGroups(
            state?.config
              ? groupsFromBreakoutState(state)
              : data.groups.length > 0
              ? data.groups
              : defaultBreakoutGroups(data.students ?? []),
          );
        }
      } catch {
        if (!cancelled) {
          setStudents(studentsFromBreakoutState(state));
          setGroups(groupsFromBreakoutState(state));
          setStatus("기본 모둠을 불러오지 못했어요. 여기서 직접 설정할 수 있어요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [boardId, state]);

  const disabled = busy || submitting || loading;

  async function disableBreakout() {
    if (!state?.config || disabled) return;
    setSubmitting(true);
    try {
      await onDisable();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={disabled ? undefined : onClose} />
      <div
        className="add-card-modal stream-breakout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-breakout-modal-title"
      >
        <form onSubmit={submit}>
          <div className="modal-header">
            <h2 className="modal-title" id="stream-breakout-modal-title">
              모둠활동 설정
            </h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={disabled}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="stream-template-modal-section">{section.title}</p>
            {loading ? (
              <p className="stream-breakout-modal-hint">기본 모둠을 불러오는 중...</p>
            ) : (
              <GroupRosterEditor
                students={students}
                groups={groups}
                onChange={setGroups}
                disabled={disabled}
              />
            )}
            <p className="stream-breakout-modal-hint">
              {state?.config
                ? "이 변경은 이 섹션의 모둠활동에만 적용됩니다."
                : "학급 기본 모둠을 가져왔어요. 여기서 바꿔도 이 섹션에만 적용됩니다."}
            </p>
            {status && <p className="stream-breakout-modal-hint">{status}</p>}
            <div className="stream-template-modal-actions stream-breakout-modal-actions">
              {state?.config && (
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={disableBreakout}
                  disabled={disabled}
                >
                  모둠활동 해제
                </button>
              )}
              <button type="submit" className="modal-btn-submit" disabled={disabled}>
                저장
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
