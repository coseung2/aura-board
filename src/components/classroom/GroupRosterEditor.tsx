"use client";

import { useMemo } from "react";

export type GroupEditorStudent = {
  id: string;
  name: string;
  number: number | null;
};

export type GroupEditorDraft = {
  name: string;
  studentIds: string[];
};

type Props = {
  students: GroupEditorStudent[];
  groups: GroupEditorDraft[];
  disabled?: boolean;
  onChange: (groups: GroupEditorDraft[]) => void;
};

const UNASSIGNED = "__unassigned";

export function GroupRosterEditor({
  students,
  groups,
  disabled = false,
  onChange,
}: Props) {
  const assignmentByStudent = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((group, groupIndex) => {
      group.studentIds.forEach((studentId) => map.set(studentId, groupIndex));
    });
    return map;
  }, [groups]);

  const unassignedStudents = useMemo(
    () => students.filter((s) => !assignmentByStudent.has(s.id)),
    [students, assignmentByStudent],
  );

  function updateGroupName(groupIndex: number, name: string) {
    onChange(
      groups.map((group, index) =>
        index === groupIndex ? { ...group, name } : group,
      ),
    );
  }

  function assignStudent(studentId: string, rawGroupIndex: string) {
    const next = groups.map((group) => ({
      ...group,
      studentIds: group.studentIds.filter((id) => id !== studentId),
    }));
    if (rawGroupIndex !== UNASSIGNED) {
      const groupIndex = Number(rawGroupIndex);
      if (Number.isInteger(groupIndex) && next[groupIndex]) {
        next[groupIndex] = {
          ...next[groupIndex],
          studentIds: [...next[groupIndex].studentIds, studentId],
        };
      }
    }
    onChange(next);
  }

  function addGroup() {
    onChange([...groups, { name: `${groups.length + 1}모둠`, studentIds: [] }]);
  }

  function removeGroup(groupIndex: number) {
    onChange(groups.filter((_, index) => index !== groupIndex));
  }

  function autoDistribute() {
    const count = Math.max(
      1,
      groups.length || Math.min(4, students.length || 1),
    );
    const next = Array.from({ length: count }, (_, index) => ({
      name: groups[index]?.name?.trim() || `${index + 1}모둠`,
      studentIds: [] as string[],
    }));
    students.forEach((student, index) => {
      next[index % count].studentIds.push(student.id);
    });
    onChange(next);
  }

  return (
    <div className="group-roster-editor">
      <div className="group-roster-toolbar">
        <button type="button" onClick={addGroup} disabled={disabled}>
          모둠 추가
        </button>
        <button type="button" onClick={autoDistribute} disabled={disabled}>
          번호순 자동 배정
        </button>
      </div>

      <div className="group-roster-name-grid">
        {groups.map((group, groupIndex) => (
          <label className="group-roster-name-field" key={groupIndex}>
            <span>{groupIndex + 1}</span>
            <input
              value={group.name}
              onChange={(event) =>
                updateGroupName(groupIndex, event.target.value)
              }
              disabled={disabled}
              maxLength={80}
            />
            <button
              type="button"
              onClick={() => removeGroup(groupIndex)}
              disabled={disabled || groups.length <= 1}
              aria-label={`${group.name} 삭제`}
            >
              삭제
            </button>
          </label>
        ))}
      </div>

      {students.length > 0 && (
        <div className="group-roster-grid">
          {groups.map((group, groupIndex) => {
            const members = students.filter(
              (s) => assignmentByStudent.get(s.id) === groupIndex,
            );
            return (
              <div className="group-roster-card" key={groupIndex}>
                <div className="group-roster-card-head">
                  <span className="group-roster-card-index">
                    {groupIndex + 1}
                  </span>
                  <strong>{group.name || `${groupIndex + 1}모둠`}</strong>
                  <span className="group-roster-card-count">
                    {members.length}명
                  </span>
                </div>
                <div className="group-roster-card-body">
                  {members.length === 0 ? (
                    <span className="group-roster-card-empty">학생 없음</span>
                  ) : (
                    members.map((student) => (
                      <div className="group-roster-member" key={student.id}>
                        <span>
                          {student.number != null
                            ? `${student.number}번 ${student.name}`
                            : student.name}
                        </span>
                        <select
                          value={groupIndex}
                          onChange={(event) =>
                            assignStudent(student.id, event.target.value)
                          }
                          disabled={disabled || groups.length === 0}
                          aria-label="모둠 변경"
                        >
                          {groups.map((g, i) => (
                            <option value={i} key={i}>
                              {g.name || `${i + 1}모둠`}
                            </option>
                          ))}
                          <option value={UNASSIGNED}>미배정</option>
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unassignedStudents.length > 0 && (
        <div className="group-roster-unassigned">
          <strong>미배정 ({unassignedStudents.length}명)</strong>
          <div className="group-roster-member-list">
            {unassignedStudents.map((student) => (
              <div className="group-roster-member" key={student.id}>
                <span>
                  {student.number != null
                    ? `${student.number}번 ${student.name}`
                    : student.name}
                </span>
                <select
                  value={UNASSIGNED}
                  onChange={(event) =>
                    assignStudent(student.id, event.target.value)
                  }
                  disabled={disabled || groups.length === 0}
                  aria-label="모둠 배정"
                >
                  <option value={UNASSIGNED}>배정</option>
                  {groups.map((g, i) => (
                    <option value={i} key={i}>
                      {g.name || `${i + 1}모둠`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {students.length === 0 && (
        <p className="group-roster-empty">학생을 먼저 추가하세요.</p>
      )}
    </div>
  );
}
