"use client";

import { useMemo, useRef, useState } from "react";
import {
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./GroupRosterEditor";
import { ClassroomSeatingEditor } from "./ClassroomSeatingEditor";
import { SeatingLayoutLibrary } from "./SeatingLayoutLibrary";
import { isSeatingExcludedStudent } from "@/lib/seating-exclusions";
import styles from "./ClassroomGroupsTab.module.css";

type Props = {
  classroomId: string;
  classroomName: string;
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

function restoreSavedGroups(
  savedGroups: GroupEditorDraft[],
  students: GroupEditorStudent[],
): GroupEditorDraft[] {
  const validIds = new Set(students.map((student) => student.id));
  const seen = new Set<string>();
  const groups = savedGroups.map((group, index) => {
    const studentIds = group.studentIds.filter((studentId) => {
      if (!validIds.has(studentId) || seen.has(studentId)) return false;
      seen.add(studentId);
      return true;
    });
    return {
      name: group.name.trim() || `${index + 1}분단`,
      studentIds,
    };
  });

  return groups.length > 0 ? groups : [{ name: "1분단", studentIds: [] }];
}

function groupsMatch(
  first: GroupEditorDraft[],
  second: GroupEditorDraft[],
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
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
  classroomName,
  students,
  initialGroups,
}: Props) {
  const seatingStudents = useMemo(
    () => students.filter((student) => !isSeatingExcludedStudent(student)),
    [students],
  );
  const normalizedInitialGroups = useMemo(
    () =>
      initialGroups.length > 0
        ? restoreSavedGroups(initialGroups, seatingStudents)
        : defaultGroups(seatingStudents),
    [initialGroups, seatingStudents],
  );
  const [groups, setGroups] = useState<GroupEditorDraft[]>(
    normalizedInitialGroups,
  );
  const [appliedGroups, setAppliedGroups] = useState<GroupEditorDraft[]>(
    initialGroups.length > 0 ? normalizedInitialGroups : [],
  );
  const [saving, setSaving] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    kind: "error" | "success" | "info";
  } | null>(null);
  const draftVersion = useRef(0);
  const isDirty = !groupsMatch(groups, appliedGroups);

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
    if (saving || libraryBusy) return;
    if (!validation.canSave) {
      setStatus({ message: validation.message, kind: "error" });
      return;
    }
    const versionAtStart = draftVersion.current;
    const groupsAtStart = groups;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/groups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: groupsAtStart }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(serverErrorMessage(payload?.error));
      }
      const data = (await res.json()) as { groups: GroupEditorDraft[] };
      setAppliedGroups(data.groups);
      if (draftVersion.current === versionAtStart) {
        setGroups(data.groups);
        setStatus({ message: "학급에 적용했어요.", kind: "success" });
      } else {
        setStatus({
          message: "학급에 적용했어요. 이후에 바꾼 초안은 유지했어요.",
          kind: "success",
        });
      }
    } catch (error) {
      setStatus({
        message:
          error instanceof Error
            ? error.message
            : "자리 배치 저장에 실패했어요.",
        kind: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleGroupsChange(nextGroups: GroupEditorDraft[]) {
    draftVersion.current += 1;
    setGroups(nextGroups);
    setStatus(null);
  }

  function handleRestore(restored: GroupEditorDraft[]) {
    const sanitized = restoreSavedGroups(restored, seatingStudents);
    draftVersion.current += 1;
    setGroups(sanitized);
    setStatus({
      message: "배치를 불러왔어요.",
      kind: "info",
    });
  }

  return (
    <section className="classroom-boards-section">
      <ClassroomSeatingEditor
        classroomName={classroomName}
        students={seatingStudents}
        groups={groups}
        onChange={handleGroupsChange}
        disabled={saving || libraryBusy}
        sidebarFooter={
          <div className={styles.sidebarFooter}>
            <div className={styles.applyRow}>
              {isDirty ? (
                <span className={styles.dirty}>변경 있음</span>
              ) : (
                <span aria-hidden="true" />
              )}
              <button
                type="button"
                className={styles.applyButton}
                onClick={() => void saveGroups()}
                disabled={
                  saving || libraryBusy || !validation.canSave || !isDirty
                }
              >
                {saving ? "적용 중..." : "학급에 적용"}
              </button>
            </div>
            {validation.message && (
              <p className={styles.validation} role="status" aria-live="polite">
                {validation.message}
              </p>
            )}
            {status && (
              <p
                className={`${styles.status} ${styles[`status-${status.kind}`]}`}
                role={status.kind === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {status.message}
              </p>
            )}
            <SeatingLayoutLibrary
              classroomId={classroomId}
              currentGroups={groups}
              onRestore={handleRestore}
              onBusyChange={setLibraryBusy}
              disabled={saving}
            />
          </div>
        }
      />
    </section>
  );
}
