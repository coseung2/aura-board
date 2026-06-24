"use client";

import { useState } from "react";
import {
  GroupRosterEditor,
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./GroupRosterEditor";

type Props = {
  classroomId: string;
  students: GroupEditorStudent[];
  initialGroups: GroupEditorDraft[];
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

export function ClassroomGroupsTab({
  classroomId,
  students,
  initialGroups,
}: Props) {
  const [groups, setGroups] = useState<GroupEditorDraft[]>(
    initialGroups.length > 0 ? initialGroups : defaultGroups(students),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function saveGroups() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/classroom/${classroomId}/groups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { groups: GroupEditorDraft[] };
      setGroups(data.groups);
      setStatus("기본 모둠을 저장했어요.");
    } catch {
      setStatus("기본 모둠 저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="classroom-boards-section">
      <div className="classroom-boards-header">
        <div>
          <h2 className="classroom-boards-heading">모둠 배정</h2>
          <p className="classroom-setting-hint">
            새 보드를 만들 때 이 모둠이 복사됩니다. 이미 만들어진 보드와
            섹션 모둠활동은 바뀌지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="classroom-action-btn"
          onClick={() => void saveGroups()}
          disabled={saving}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
      <GroupRosterEditor
        students={students}
        groups={groups}
        onChange={setGroups}
        disabled={saving}
      />
      {status && <p className="classroom-setting-hint">{status}</p>}
    </section>
  );
}
