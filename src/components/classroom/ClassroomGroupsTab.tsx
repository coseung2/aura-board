"use client";

import { useMemo, useState } from "react";
import {
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./GroupRosterEditor";
import { ClassroomSeatingEditor } from "./ClassroomSeatingEditor";
import { isSeatingExcludedStudent } from "@/lib/seating-exclusions";

type Props = {
  classroomId: string;
  students: GroupEditorStudent[];
  initialGroups: GroupEditorDraft[];
};

function defaultGroups(students: GroupEditorStudent[]): GroupEditorDraft[] {
  return chunkIntoSeatGroups(
    students.map((student) => student.id),
    students,
  );
}

function chunkIntoSeatGroups(
  orderedIds: string[],
  students: GroupEditorStudent[],
  options: { includeMissingStudents?: boolean } = {},
): GroupEditorDraft[] {
  const includeMissingStudents = options.includeMissingStudents ?? true;
  const validIds = new Set(students.map((student) => student.id));
  const seen = new Set<string>();
  const normalizedIds = orderedIds.filter((studentId) => {
    if (!validIds.has(studentId) || seen.has(studentId)) return false;
    seen.add(studentId);
    return true;
  });
  if (includeMissingStudents) {
    for (const student of students) {
      if (!seen.has(student.id)) normalizedIds.push(student.id);
    }
  }

  const count = Math.max(1, Math.ceil((normalizedIds.length || 1) / 4));
  const groups = Array.from({ length: count }, (_, index) => ({
    name: `${index + 1}분단`,
    studentIds: [] as string[],
  }));

  normalizedIds.forEach((studentId, index) => {
    groups[Math.floor(index / 4)].studentIds.push(studentId);
  });
  return groups;
}

function serverErrorMessage(error: string | undefined): string {
  switch (error) {
    case "student_unassigned":
      return "모든 학생을 좌석에 배정해야 저장할 수 있어요.";
    case "duplicate_student":
      return "같은 학생이 두 좌석에 중복 배정되어 있어요.";
    case "student_not_in_classroom":
      return "학급에 없는 학생이 포함되어 있어요. 새로고침 후 다시 시도해 주세요.";
    case "empty_group":
      return "빈 분단은 삭제하거나 학생을 배정해 주세요.";
    default:
      return "자리 배치 저장에 실패했어요.";
  }
}

export function ClassroomGroupsTab({
  classroomId,
  students,
  initialGroups,
}: Props) {
  const seatingStudents = useMemo(
    () => students.filter((student) => !isSeatingExcludedStudent(student)),
    [students],
  );
  const [groups, setGroups] = useState<GroupEditorDraft[]>(
    initialGroups.length > 0
      ? chunkIntoSeatGroups(
          initialGroups.flatMap((group) => group.studentIds),
          seatingStudents,
          { includeMissingStudents: false },
        )
      : defaultGroups(seatingStudents),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const validation = useMemo(() => {
    const studentIds = new Set(seatingStudents.map((student) => student.id));
    const studentNames = new Map(
      seatingStudents.map((student) => [student.id, student.name]),
    );
    const assignedIds = groups.flatMap((group) => group.studentIds);
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const studentId of assignedIds) {
      if (seen.has(studentId)) {
        duplicates.add(studentId);
      }
      seen.add(studentId);
    }

    const invalidStudentId = assignedIds.find(
      (studentId) => !studentIds.has(studentId),
    );
    const unassigned = seatingStudents.filter(
      (student) => !seen.has(student.id),
    );
    const emptyGroup = groups.find((group) => group.studentIds.length === 0);
    const unnamedGroupIndex = groups.findIndex(
      (group) => group.name.trim().length === 0,
    );

    if (seatingStudents.length === 0) {
      return { canSave: false, message: "학생을 먼저 추가하세요." };
    }
    if (groups.length === 0) {
      return { canSave: false, message: "분단을 하나 이상 만들어 주세요." };
    }
    if (unnamedGroupIndex >= 0) {
      return {
        canSave: false,
        message: `${unnamedGroupIndex + 1}분단 이름을 입력해 주세요.`,
      };
    }
    if (invalidStudentId) {
      return {
        canSave: false,
        message:
          "학급에 없는 학생이 포함되어 있어요. 새로고침 후 다시 시도해 주세요.",
      };
    }
    if (duplicates.size > 0) {
      const duplicateName =
        studentNames.get(Array.from(duplicates)[0]) ?? "학생";
      return {
        canSave: false,
        message: `${duplicateName} 학생이 두 좌석에 중복 배정되어 있어요.`,
      };
    }
    if (emptyGroup) {
      return {
        canSave: false,
        message: "빈 분단은 삭제하거나 학생을 배정해 주세요.",
      };
    }
    if (unassigned.length > 0) {
      return {
        canSave: true,
        message: `미배정 학생 ${unassigned.length}명은 자리 배치에서 제외돼요.`,
      };
    }
    return { canSave: true, message: "" };
  }, [groups, seatingStudents]);

  async function saveGroups() {
    if (!validation.canSave) {
      setStatus(validation.message);
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/classroom/${classroomId}/groups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(serverErrorMessage(payload?.error));
      }
      const data = (await res.json()) as { groups: GroupEditorDraft[] };
      setGroups(data.groups);
      setStatus("자리 배치를 저장했어요.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "자리 배치 저장에 실패했어요.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleGroupsChange(nextGroups: GroupEditorDraft[]) {
    setGroups(nextGroups);
    setStatus("");
  }

  return (
    <section className="classroom-boards-section">
      <div className="classroom-boards-header">
        <div>
          <h2 className="classroom-boards-heading">자리 배치</h2>
          <p className="classroom-setting-hint">
            저장한 자리 배치는 학급 기본 모둠으로 쓰이며 새 보드, 기존 보드,
            스트림보드의 모둠활동 설정에 이어서 반영됩니다.
          </p>
        </div>
        <button
          type="button"
          className="classroom-action-btn"
          onClick={() => void saveGroups()}
          disabled={saving || !validation.canSave}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
      <ClassroomSeatingEditor
        students={seatingStudents}
        groups={groups}
        onChange={handleGroupsChange}
        disabled={saving}
      />
      {validation.message && (
        <p
          className="classroom-setting-warning"
          role="status"
          aria-live="polite"
        >
          {validation.message}
        </p>
      )}
      {status && (
        <p className="classroom-setting-hint" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  );
}
