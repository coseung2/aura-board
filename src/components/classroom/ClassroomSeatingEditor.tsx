"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./GroupRosterEditor";

type Props = {
  students: GroupEditorStudent[];
  groups: GroupEditorDraft[];
  disabled?: boolean;
  onChange: (groups: GroupEditorDraft[]) => void;
};

const GROUP_SIZE = 4;

/**
 * Where a drag would land. `seat` targets a specific slot (swap or insert);
 * `area` drops at the end of a group; `unassigned` removes the seat.
 */
type DropTarget =
  | { kind: "seat"; groupIndex: number; seatIndex: number }
  | { kind: "area"; groupIndex: number }
  | { kind: "unassigned" };

function isSameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "seat" && b.kind === "seat") {
    return a.groupIndex === b.groupIndex && a.seatIndex === b.seatIndex;
  }
  if (a.kind === "area" && b.kind === "area") {
    return a.groupIndex === b.groupIndex;
  }
  return true;
}
const PLACEMENT_STEP_MS = 110;
const MIN_GROUP_COUNT = 1;
type StudentGender = "male" | "female";
type PairMode = "any" | "mixed" | "same" | "male_male" | "female_female";
type FixedPair = {
  id: string;
  studentIds: [string, string];
};

function fixedPairId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function genderOf(
  student: GroupEditorStudent | undefined,
): StudentGender | null {
  return student?.gender === "male" || student?.gender === "female"
    ? student.gender
    : null;
}

function genderLabel(gender: string | null | undefined): string {
  if (gender === "male") return "남";
  if (gender === "female") return "여";
  return "미정";
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function cloneGroups(groups: GroupEditorDraft[]): GroupEditorDraft[] {
  return groups.map((group) => ({
    ...group,
    studentIds: [...group.studentIds],
  }));
}

function clampGroupCount(count: number, max: number): number {
  return Math.min(
    Math.max(count, MIN_GROUP_COUNT),
    Math.max(MIN_GROUP_COUNT, max),
  );
}

function seatingTransitionName(studentId: string) {
  return `seat-${studentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function pairMatches(
  a: GroupEditorStudent | undefined,
  b: GroupEditorStudent | undefined,
  mode: PairMode,
): boolean {
  if (mode === "any") return true;
  const aGender = genderOf(a);
  const bGender = genderOf(b);
  if (!aGender || !bGender) return false;
  if (mode === "mixed") return aGender !== bGender;
  if (mode === "same") return aGender === bGender;
  if (mode === "male_male") return aGender === "male" && bGender === "male";
  return aGender === "female" && bGender === "female";
}

function pairModeLabel(mode: PairMode): string {
  switch (mode) {
    case "mixed":
      return "남녀";
    case "same":
      return "동성";
    case "male_male":
      return "남남";
    case "female_female":
      return "여여";
    default:
      return "제한 없음";
  }
}

function scaledGenderTargets(
  size: number,
  femaleTarget: number,
  maleTarget: number,
) {
  const quotaTotal = femaleTarget + maleTarget;
  if (size <= 0 || quotaTotal <= 0)
    return { female: 0, male: 0, scaled: false };
  if (quotaTotal <= size) {
    return { female: femaleTarget, male: maleTarget, scaled: false };
  }

  const femaleExact = (femaleTarget / quotaTotal) * size;
  let female = Math.floor(femaleExact);
  let male = Math.floor((maleTarget / quotaTotal) * size);
  let remaining = size - female - male;

  const femaleRemainder = femaleExact - female;
  const maleRemainder = (maleTarget / quotaTotal) * size - male;
  while (remaining > 0) {
    if (femaleRemainder >= maleRemainder && female < femaleTarget) {
      female += 1;
    } else if (male < maleTarget) {
      male += 1;
    } else {
      female += 1;
    }
    remaining -= 1;
  }

  return { female, male, scaled: true };
}

export function ClassroomSeatingEditor({
  students,
  groups,
  disabled = false,
  onChange,
}: Props) {
  const [pairMode, setPairMode] = useState<PairMode>("mixed");
  const [useGenderQuota, setUseGenderQuota] = useState(false);
  const [maleTarget, setMaleTarget] = useState(2);
  const [femaleTarget, setFemaleTarget] = useState(2);
  const [randomStatus, setRandomStatus] = useState("");
  const [draggingStudentId, setDraggingStudentId] = useState<string | null>(
    null,
  );
  const [placementRunId, setPlacementRunId] = useState(0);
  const [fixedPairs, setFixedPairs] = useState<FixedPair[]>([]);
  const [pairFirstId, setPairFirstId] = useState("");
  const [pairSecondId, setPairSecondId] = useState("");
  /**
   * Drop target under the cursor. Dragover only updates this highlight; the
   * seating data is mutated exactly once on drop (2026-07-27). Previously
   * dragover swapped students for real, which reordered the DOM mid-drag and
   * made drops land on stale targets.
   */
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const studentMap = useMemo(() => {
    const map = new Map<string, GroupEditorStudent>();
    students.forEach((student) => map.set(student.id, student));
    return map;
  }, [students]);

  const seatMap = useMemo(() => {
    const map = new Map<string, { groupIndex: number; seatIndex: number }>();
    groups.forEach((group, groupIndex) => {
      group.studentIds.forEach((studentId, seatIndex) => {
        map.set(studentId, { groupIndex, seatIndex });
      });
    });
    return map;
  }, [groups]);
  const arrangedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((group) => {
      group.studentIds.forEach((studentId) => {
        if (studentMap.has(studentId)) ids.add(studentId);
      });
    });
    return ids;
  }, [groups, studentMap]);
  const arrangeableStudents = useMemo(
    () => students.filter((student) => arrangedStudentIds.has(student.id)),
    [students, arrangedStudentIds],
  );
  const maxGroupCount = Math.max(MIN_GROUP_COUNT, arrangeableStudents.length);
  const groupCount = clampGroupCount(
    groups.length || MIN_GROUP_COUNT,
    maxGroupCount,
  );

  const unassigned = useMemo(
    () => students.filter((student) => !seatMap.has(student.id)),
    [students, seatMap],
  );
  const arrangeableUnknownGenderCount = useMemo(
    () => arrangeableStudents.filter((student) => !genderOf(student)).length,
    [arrangeableStudents],
  );
  const validFixedPairs = useMemo(
    () =>
      fixedPairs.filter(
        (pair) =>
          arrangedStudentIds.has(pair.studentIds[0]) &&
          arrangedStudentIds.has(pair.studentIds[1]),
      ),
    [arrangedStudentIds, fixedPairs],
  );
  const fixedPairStudentIds = useMemo(() => {
    const ids = new Set<string>();
    validFixedPairs.forEach((pair) => {
      ids.add(pair.studentIds[0]);
      ids.add(pair.studentIds[1]);
    });
    return ids;
  }, [validFixedPairs]);
  const pairableStudents = useMemo(
    () =>
      arrangeableStudents.filter(
        (student) => !fixedPairStudentIds.has(student.id),
      ),
    [arrangeableStudents, fixedPairStudentIds],
  );

  useEffect(() => {
    if (!draggingStudentId) return;
    function handleWindowDragEnd() {
      endDrag();
    }
    window.addEventListener("dragend", handleWindowDragEnd);
    return () => window.removeEventListener("dragend", handleWindowDragEnd);
  }, [draggingStudentId]);

  function withoutStudent(
    studentId: string,
    sourceGroups = groups,
  ): GroupEditorDraft[] {
    return sourceGroups.map((group) => ({
      ...group,
      studentIds: group.studentIds.filter((id) => id !== studentId),
    }));
  }

  function changeGroups(nextGroups: GroupEditorDraft[]) {
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => {
        finished: Promise<void>;
      };
    };
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!doc.startViewTransition || prefersReducedMotion) {
      onChange(nextGroups);
      return;
    }
    doc.startViewTransition(() => {
      flushSync(() => onChange(nextGroups));
    });
  }

  function startStudentDrag(studentId: string) {
    setDraggingStudentId(studentId);
    setDropTarget(null);
  }

  function endDrag() {
    setDraggingStudentId(null);
    setDropTarget(null);
  }

  /** Dragover handler: records the hovered target without touching the data. */
  function highlightDropTarget(target: DropTarget) {
    if (disabled || !draggingStudentId) return;
    setDropTarget((current) =>
      isSameDropTarget(current, target) ? current : target,
    );
  }

  /** Single commit point for every drop path. */
  function applyDrop(studentId: string, target: DropTarget) {
    if (disabled) {
      endDrag();
      return;
    }
    if (target.kind === "unassigned") {
      moveToUnassigned(studentId);
    } else if (target.kind === "seat") {
      moveDraggedStudent(studentId, target.groupIndex, target.seatIndex);
    } else {
      moveDraggedStudent(studentId, target.groupIndex);
    }
    endDrag();
  }

  function readDraggedId(event: React.DragEvent): string | null {
    return (
      draggingStudentId || event.dataTransfer.getData("text/plain") || null
    );
  }

  function moveDraggedStudent(
    studentId: string,
    targetGroupIndex: number,
    targetSeatIndex?: number,
  ) {
    if (disabled || !groups[targetGroupIndex]) return;
    const targetStudentId =
      targetSeatIndex == null
        ? null
        : (groups[targetGroupIndex].studentIds[targetSeatIndex] ?? null);
    if (targetStudentId === studentId) return;

    const source = seatMap.get(studentId);
    const target = targetStudentId ? seatMap.get(targetStudentId) : null;
    const next = groups.map((group) => ({
      ...group,
      studentIds: [...group.studentIds],
    }));

    if (targetStudentId && source && target) {
      next[source.groupIndex].studentIds[source.seatIndex] = targetStudentId;
      next[target.groupIndex].studentIds[target.seatIndex] = studentId;
      changeGroups(next);
      return;
    }

    const without = withoutStudent(studentId, next);
    const targetIds = [...without[targetGroupIndex].studentIds];
    if (targetIds.length >= GROUP_SIZE) return;
    const insertIndex =
      targetSeatIndex == null
        ? targetIds.length
        : Math.min(Math.max(targetSeatIndex, 0), targetIds.length);
    targetIds.splice(insertIndex, 0, studentId);
    without[targetGroupIndex] = {
      ...without[targetGroupIndex],
      studentIds: targetIds,
    };
    changeGroups(without);
  }

  function moveToUnassigned(studentId: string) {
    if (disabled || !seatMap.has(studentId)) return;
    changeGroups(withoutStudent(studentId));
  }

  function addFixedPair() {
    if (!pairFirstId || !pairSecondId || pairFirstId === pairSecondId) return;
    if (
      fixedPairStudentIds.has(pairFirstId) ||
      fixedPairStudentIds.has(pairSecondId)
    ) {
      return;
    }
    const id = fixedPairId(pairFirstId, pairSecondId);
    setFixedPairs((current) =>
      current.some((pair) => pair.id === id)
        ? current
        : [...current, { id, studentIds: [pairFirstId, pairSecondId] }],
    );
    setPairFirstId("");
    setPairSecondId("");
  }

  function removeFixedPair(pairId: string) {
    setFixedPairs((current) => current.filter((pair) => pair.id !== pairId));
  }

  function resizeGroups(rawCount: number) {
    if (disabled) return;
    const count = clampGroupCount(rawCount, maxGroupCount);
    const orderedStudentIds = groups.flatMap((group) =>
      group.studentIds.filter((studentId) => studentMap.has(studentId)),
    );
    const baseSize = Math.floor(orderedStudentIds.length / count);
    const remainder = orderedStudentIds.length % count;
    let cursor = 0;
    const next = Array.from({ length: count }, (_, groupIndex) => {
      const size = baseSize + (groupIndex < remainder ? 1 : 0);
      const studentIds = orderedStudentIds.slice(cursor, cursor + size);
      cursor += size;
      return {
        name: groups[groupIndex]?.name?.trim() || `${groupIndex + 1}분단`,
        studentIds,
      };
    });
    setRandomStatus("");
    onChange(next);
  }

  function randomArrange() {
    if (arrangeableStudents.length === 0) {
      setRandomStatus(
        "배치할 학생이 없어요. 미배정 학생은 랜덤 배치에서 제외돼요.",
      );
      return;
    }
    const columnCount = groupCount;
    const baseSize = Math.floor(arrangeableStudents.length / columnCount);
    const remainder = arrangeableStudents.length % columnCount;
    const sizes = Array.from(
      { length: columnCount },
      (_, index) => baseSize + (index < remainder ? 1 : 0),
    );
    if (validFixedPairs.length > 0) {
      const next: GroupEditorDraft[] = sizes.map((_, groupIndex) => ({
        name: groups[groupIndex]?.name?.trim() || `${groupIndex + 1}분단`,
        studentIds: [],
      }));
      const remaining = [...sizes];
      let partial = false;

      function placeUnit(ids: string[]) {
        const candidates = remaining
          .map((space, groupIndex) => ({ space, groupIndex }))
          .filter((candidate) => candidate.space >= ids.length);
        if (candidates.length === 0) {
          partial = true;
          return;
        }
        const maxSpace = Math.max(
          ...candidates.map((candidate) => candidate.space),
        );
        const best = candidates.filter(
          (candidate) => candidate.space === maxSpace,
        );
        const target = shuffle(best)[0];
        next[target.groupIndex].studentIds.push(...ids);
        remaining[target.groupIndex] -= ids.length;
      }

      shuffle(validFixedPairs).forEach((pair) => {
        placeUnit(shuffle([...pair.studentIds]));
      });
      shuffle(
        arrangeableStudents.filter(
          (student) => !fixedPairStudentIds.has(student.id),
        ),
      ).forEach((student) => {
        placeUnit([student.id]);
      });

      const notes = [
        partial
          ? "지정한 짝은 유지하고 가능한 범위에서 랜덤 배치했어요."
          : `지정짝 ${validFixedPairs.length}쌍을 함께 랜덤 배치했어요.`,
      ];
      if (useGenderQuota || pairMode !== "any") {
        notes.push(
          "고정짝이 있는 동안 성비/짝 조건은 보조 조건으로만 적용돼요.",
        );
      }
      if (arrangeableUnknownGenderCount > 0) {
        notes.push(
          `성별 미지정 ${arrangeableUnknownGenderCount}명은 성비 조건에서 제외됐어요.`,
        );
      }
      if (unassigned.length > 0) {
        notes.push(`미배정 ${unassigned.length}명은 그대로 제외했어요.`);
      }
      setRandomStatus(notes.join(" "));
      setPlacementRunId((current) => current + 1);
      onChange(next);
      return;
    }
    const malePool = shuffle(
      arrangeableStudents.filter((student) => genderOf(student) === "male"),
    );
    const femalePool = shuffle(
      arrangeableStudents.filter((student) => genderOf(student) === "female"),
    );
    const unknownPool = shuffle(
      arrangeableStudents.filter((student) => !genderOf(student)),
    );
    let partial = false;

    function takeFrom(pool: GroupEditorStudent[]) {
      return pool.shift() ?? null;
    }

    function takeAny() {
      const pools = [malePool, femalePool, unknownPool].sort(
        (a, b) => b.length - a.length,
      );
      return pools[0].shift() ?? null;
    }

    const next: GroupEditorDraft[] = sizes.map((size, groupIndex) => {
      const studentIds: string[] = [];
      if (useGenderQuota) {
        const targets = scaledGenderTargets(size, femaleTarget, maleTarget);
        if (targets.scaled) partial = true;
        for (let i = 0; i < targets.female && studentIds.length < size; i++) {
          const student = takeFrom(femalePool);
          if (student) studentIds.push(student.id);
          else partial = true;
        }
        for (let i = 0; i < targets.male && studentIds.length < size; i++) {
          const student = takeFrom(malePool);
          if (student) studentIds.push(student.id);
          else partial = true;
        }
      }
      while (studentIds.length < size) {
        const student = takeAny();
        if (!student) break;
        studentIds.push(student.id);
      }
      return {
        name: groups[groupIndex]?.name?.trim() || `${groupIndex + 1}분단`,
        studentIds: shuffle(studentIds),
      };
    });

    if (pairMode !== "any") {
      let pairCount = 0;
      let matchedCount = 0;
      const maxRows = Math.max(
        0,
        ...next.map((group) => group.studentIds.length),
      );
      for (let row = 0; row < maxRows; row++) {
        for (let left = 0; left < next.length - 1; left += 2) {
          const leftId = next[left].studentIds[row];
          const rightIds = next[left + 1].studentIds;
          const rightId = rightIds[row];
          if (!leftId || !rightId) continue;
          pairCount += 1;
          if (
            pairMatches(
              studentMap.get(leftId),
              studentMap.get(rightId),
              pairMode,
            )
          ) {
            matchedCount += 1;
            continue;
          }
          const swapIndex = rightIds.findIndex((candidateId, index) => {
            if (index === row) return false;
            return pairMatches(
              studentMap.get(leftId),
              studentMap.get(candidateId),
              pairMode,
            );
          });
          if (swapIndex >= 0) {
            [rightIds[row], rightIds[swapIndex]] = [
              rightIds[swapIndex],
              rightIds[row],
            ];
            matchedCount += 1;
          } else {
            partial = true;
          }
        }
      }
      if (pairCount > 0 && matchedCount < pairCount) partial = true;
    }

    const notes = [
      partial
        ? "조건을 완전히 맞추긴 어려워 가능한 범위에서 랜덤 배치했어요."
        : `${pairModeLabel(pairMode)} 조건으로 랜덤 배치했어요.`,
    ];
    if (arrangeableUnknownGenderCount > 0) {
      notes.push(
        `성별 미지정 ${arrangeableUnknownGenderCount}명은 성비 조건에서 제외됐어요.`,
      );
    }
    if (unassigned.length > 0) {
      notes.push(`미배정 ${unassigned.length}명은 그대로 제외했어요.`);
    }
    setRandomStatus(notes.join(" "));
    setPlacementRunId((current) => current + 1);
    onChange(next);
  }

  if (students.length === 0) {
    return <p className="seating-empty">학생을 먼저 추가하세요.</p>;
  }

  return (
    <div className="seating-editor">
      <div className="seating-random-panel">
        <label className="seating-random-number">
          <span>모둠 수</span>
          <input
            type="number"
            min={MIN_GROUP_COUNT}
            max={maxGroupCount}
            value={groupCount}
            onChange={(event) =>
              resizeGroups(Number(event.target.value) || MIN_GROUP_COUNT)
            }
            disabled={disabled}
          />
        </label>
        <label className="seating-random-field">
          <span>짝 조건</span>
          <select
            value={pairMode}
            onChange={(event) => setPairMode(event.target.value as PairMode)}
            disabled={disabled}
          >
            <option value="any">제한 없음</option>
            <option value="mixed">남녀</option>
            <option value="same">동성</option>
            <option value="male_male">남남</option>
            <option value="female_female">여여</option>
          </select>
        </label>
        <label className="seating-random-check">
          <input
            type="checkbox"
            checked={useGenderQuota}
            onChange={(event) => setUseGenderQuota(event.target.checked)}
            disabled={disabled}
          />
          <span>분단별 성비</span>
        </label>
        <label className="seating-random-number">
          <span>여</span>
          <input
            type="number"
            min={0}
            max={10}
            value={femaleTarget}
            onChange={(event) =>
              setFemaleTarget(Math.max(0, Number(event.target.value) || 0))
            }
            disabled={disabled || !useGenderQuota}
          />
        </label>
        <label className="seating-random-number">
          <span>남</span>
          <input
            type="number"
            min={0}
            max={10}
            value={maleTarget}
            onChange={(event) =>
              setMaleTarget(Math.max(0, Number(event.target.value) || 0))
            }
            disabled={disabled || !useGenderQuota}
          />
        </label>
        <button type="button" onClick={randomArrange} disabled={disabled}>
          랜덤 배치
        </button>
      </div>
      <div className="seating-fixed-pair-panel">
        <div className="seating-fixed-pair-controls">
          <label className="seating-random-field">
            <span>짝 지정</span>
            <select
              value={pairFirstId}
              onChange={(event) => setPairFirstId(event.target.value)}
              disabled={disabled}
            >
              <option value="">학생 선택</option>
              {pairableStudents.map((student) => (
                <option value={student.id} key={student.id}>
                  {student.number != null ? `${student.number}번 ` : ""}
                  {student.name}
                </option>
              ))}
            </select>
          </label>
          <label className="seating-random-field">
            <span>함께</span>
            <select
              value={pairSecondId}
              onChange={(event) => setPairSecondId(event.target.value)}
              disabled={disabled || !pairFirstId}
            >
              <option value="">학생 선택</option>
              {pairableStudents
                .filter((student) => student.id !== pairFirstId)
                .map((student) => (
                  <option value={student.id} key={student.id}>
                    {student.number != null ? `${student.number}번 ` : ""}
                    {student.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addFixedPair}
            disabled={disabled || !pairFirstId || !pairSecondId}
          >
            추가
          </button>
        </div>
        {validFixedPairs.length > 0 && (
          <div className="seating-fixed-pair-list">
            {validFixedPairs.map((pair) => {
              const first = studentMap.get(pair.studentIds[0]);
              const second = studentMap.get(pair.studentIds[1]);
              return (
                <span className="seating-fixed-pair-chip" key={pair.id}>
                  {first?.name ?? "학생"} · {second?.name ?? "학생"}
                  <button
                    type="button"
                    onClick={() => removeFixedPair(pair.id)}
                    disabled={disabled}
                    aria-label="짝 해제"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
      {randomStatus && (
        <p className="seating-random-status" role="status" aria-live="polite">
          {randomStatus}
        </p>
      )}

      <div className="seating-board">
        <span className="seating-board-label">칠판 / 교탁</span>
      </div>

      <div className="seating-chart-wrap">
        <div
          className={`seating-chart ${draggingStudentId ? "is-dragging" : ""}`}
        >
          {groups.map((group, groupIndex) => (
            <div
              className={`seating-area ${draggingStudentId ? "is-dragging" : ""} ${
                dropTarget?.kind === "area" &&
                dropTarget.groupIndex === groupIndex
                  ? "is-drop-target"
                  : ""
              }`}
              key={groupIndex}
              onDragOver={(event) => {
                if (disabled) return;
                event.preventDefault();
                highlightDropTarget({ kind: "area", groupIndex });
              }}
              onDrop={(event) => {
                event.preventDefault();
                const studentId = readDraggedId(event);
                if (studentId) applyDrop(studentId, { kind: "area", groupIndex });
              }}
            >
              <div className="seating-area-grid">
                {Array.from({
                  length: Math.max(GROUP_SIZE, group.studentIds.length),
                }).map((_, seatIndex) => {
                  const studentId = group.studentIds[seatIndex];
                  const student = studentId ? studentMap.get(studentId) : null;
                  if (!student) {
                    return (
                      <div
                        className={`seating-slot is-empty ${
                          dropTarget?.kind === "seat" &&
                          dropTarget.groupIndex === groupIndex &&
                          dropTarget.seatIndex === seatIndex
                            ? "is-drop-target"
                            : ""
                        }`}
                        key={`empty-${groupIndex}-${seatIndex}`}
                        onDragOver={(event) => {
                          if (disabled) return;
                          event.preventDefault();
                          event.stopPropagation();
                          highlightDropTarget({
                            kind: "seat",
                            groupIndex,
                            seatIndex,
                          });
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const droppedId = readDraggedId(event);
                          if (droppedId) {
                            applyDrop(droppedId, {
                              kind: "seat",
                              groupIndex,
                              seatIndex,
                            });
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <div
                      className={`seating-desk ${
                        draggingStudentId === student.id
                          ? "is-dragging-card"
                          : ""
                      } ${placementRunId > 0 ? "is-placing" : ""} ${
                        dropTarget?.kind === "seat" &&
                        dropTarget.groupIndex === groupIndex &&
                        dropTarget.seatIndex === seatIndex &&
                        draggingStudentId !== student.id
                          ? "is-swap-target"
                          : ""
                      }`}
                      key={`${student.id}-${placementRunId}`}
                      style={{
                        animationDelay: `${
                          (groupIndex * GROUP_SIZE + seatIndex) *
                          PLACEMENT_STEP_MS
                        }ms`,
                        viewTransitionName: seatingTransitionName(student.id),
                      }}
                      draggable={!disabled}
                      onDragStart={(event) => {
                        startStudentDrag(student.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", student.id);
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(event) => {
                        if (disabled) return;
                        event.preventDefault();
                        event.stopPropagation();
                        highlightDropTarget({
                          kind: "seat",
                          groupIndex,
                          seatIndex,
                        });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const droppedId = readDraggedId(event);
                        if (droppedId) {
                          applyDrop(droppedId, {
                            kind: "seat",
                            groupIndex,
                            seatIndex,
                          });
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${student.name} 자리`}
                    >
                      <span className="seating-desk-num">
                        {student.number != null ? `${student.number}번` : "-"}
                      </span>
                      <span className="seating-desk-name">{student.name}</span>
                      <span
                        className={`seating-gender is-${student.gender ?? "unknown"}`}
                      >
                        {genderLabel(student.gender)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`seating-unassigned ${draggingStudentId ? "is-dragging" : ""} ${
          dropTarget?.kind === "unassigned" ? "is-drop-target" : ""
        }`}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          highlightDropTarget({ kind: "unassigned" });
        }}
        onDrop={(event) => {
          event.preventDefault();
          const studentId = readDraggedId(event);
          if (studentId) applyDrop(studentId, { kind: "unassigned" });
        }}
      >
        <strong>미배정 ({unassigned.length}명)</strong>
        {unassigned.length === 0 && (
          <p className="seating-unassigned-empty">미배정 학생이 없어요.</p>
        )}
        <div className="seating-unassigned-list">
          {unassigned.map((student) => (
            <div
              className="seating-desk is-unassigned"
              key={student.id}
              style={{ viewTransitionName: seatingTransitionName(student.id) }}
              draggable={!disabled}
              onDragStart={(event) => {
                startStudentDrag(student.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", student.id);
              }}
              onDragEnd={endDrag}
            >
              <span className="seating-desk-num">
                {student.number != null ? `${student.number}번` : "-"}
              </span>
              <span className="seating-desk-name">{student.name}</span>
              <span
                className={`seating-gender is-${student.gender ?? "unknown"}`}
              >
                {genderLabel(student.gender)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
