"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Volume2, VolumeX, Sparkles, CircleOff, SkipForward } from "lucide-react";
import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./GroupRosterEditor";
import { arrangeSeating } from "./classroom-seating-arrange";
import { SeatingReveal } from "./SeatingReveal";
import {
  GROUP_SIZE,
  MIN_GROUP_COUNT,
  PLACEMENT_STEP_MS,
  clampGroupCount,
  fixedPairId,
  genderLabel,
  isSameDropTarget,
  pairModeLabel,
  seatingTransitionName,
  type DropTarget,
  type FixedPair,
  type PairMode,
} from "./classroom-seating-model";

type Props = {
  students: GroupEditorStudent[];
  groups: GroupEditorDraft[];
  disabled?: boolean;
  onChange: (groups: GroupEditorDraft[]) => void;
  classroomName?: string;
  sidebarFooter?: ReactNode;
  toolbarActions?: ReactNode;
  boardStatus?: ReactNode;
};

const PAIR_OPTIONS: Array<{ value: PairMode; label: string }> = [
  { value: "any", label: "짝꿍 제한 없음" },
  { value: "mixed", label: "남녀" },
  { value: "same", label: "동성" },
  { value: "male_male", label: "남남" },
  { value: "female_female", label: "여여" },
];

function studentOptionLabel(student: GroupEditorStudent) {
  return `${student.number != null ? `${student.number}번 ` : ""}${student.name}`;
}

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

export function ClassroomSeatingEditor({
  students,
  groups,
  disabled = false,
  onChange,
  classroomName,
  sidebarFooter,
  toolbarActions,
  boardStatus,
}: Props) {
  const [pairMode, setPairMode] = useState<PairMode>("any");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  useEffect(() => {
    setMounted(true);
    try {
      setMuted(localStorage.getItem("seating-reveal-muted") === "true");
      setAnimationEnabled(localStorage.getItem("seating-animation-enabled") !== "false");
    } catch {}
  }, []);
  const [pendingReveal, setPendingReveal] = useState<GroupEditorDraft[] | null>(null);
  const [revealProgress, setRevealProgress] = useState({ count: 0, shuffling: false });
  const updateReveal = useCallback((count: number, shuffling: boolean) => setRevealProgress({ count, shuffling }), []);
  const [useGenderQuota, setUseGenderQuota] = useState(false);
  const [maleTarget, setMaleTarget] = useState(1);
  const [femaleTarget, setFemaleTarget] = useState(1);
  const [randomStatus, setRandomStatus] = useState("");
  const [randomStatusKind, setRandomStatusKind] = useState<"error" | "success">("error");
  const [draggingStudentId, setDraggingStudentId] = useState<string | null>(
    null,
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  const [placementRunId, setPlacementRunId] = useState(0);
  const [fixedPairs, setFixedPairs] = useState<FixedPair[]>([]);
  const [pairFirstId, setPairFirstId] = useState("");
  const [pairSecondId, setPairSecondId] = useState("");
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

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((group) =>
      group.studentIds.forEach((studentId) => {
        if (studentMap.has(studentId)) ids.add(studentId);
      }),
    );
    return ids;
  }, [groups, studentMap]);
  const assignedStudents = useMemo(
    () => students.filter((student) => assignedStudentIds.has(student.id)),
    [students, assignedStudentIds],
  );
  const unassigned = useMemo(
    () => students.filter((student) => !seatMap.has(student.id)),
    [students, seatMap],
  );
  const maxGroupCount = Math.max(
    MIN_GROUP_COUNT,
    groups.length,
    assignedStudents.length,
  );
  const groupCount = groups.length || MIN_GROUP_COUNT;
  const fixedPairStudentIds = useMemo(() => {
    const ids = new Set<string>();
    fixedPairs.forEach((pair) => {
      ids.add(pair.studentIds[0]);
      ids.add(pair.studentIds[1]);
    });
    return ids;
  }, [fixedPairs]);
  const pairableStudents = useMemo(
    () =>
      assignedStudents.filter((student) => !fixedPairStudentIds.has(student.id)),
    [assignedStudents, fixedPairStudentIds],
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
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
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
    setSelectedStudentId(null);
    setDraggingStudentId(studentId);
    setDropTarget(null);
  }

  function endDrag() {
    setDraggingStudentId(null);
    setDropTarget(null);
  }

  function clearRandomStatus() {
    setRandomStatus("");
    setRandomStatusKind("error");
  }

  function highlightDropTarget(target: DropTarget) {
    if (disabled || !draggingStudentId) return;
    setDropTarget((current) =>
      isSameDropTarget(current, target) ? current : target,
    );
  }

  function readDraggedId(event: DragEvent<HTMLElement>) {
    return draggingStudentId || event.dataTransfer.getData("text/plain") || null;
  }

  function moveDraggedStudent(
    studentId: string,
    targetGroupIndex: number,
    targetSeatIndex?: number,
  ) {
    if (disabled || !groups[targetGroupIndex]) return false;
    const targetStudentId =
      targetSeatIndex == null
        ? null
        : (groups[targetGroupIndex].studentIds[targetSeatIndex] ?? null);
    if (targetStudentId === studentId) return false;

    const source = seatMap.get(studentId);
    const target = targetStudentId ? seatMap.get(targetStudentId) : null;
    const next = groups.map((group) => ({
      ...group,
      studentIds: [...group.studentIds],
    }));
    if (targetStudentId && source && target) {
      next[source.groupIndex].studentIds[source.seatIndex] = targetStudentId;
      next[target.groupIndex].studentIds[target.seatIndex] = studentId;
      clearRandomStatus();
      changeGroups(next);
      return true;
    }

    const nextWithoutStudent = withoutStudent(studentId, next);
    const targetIds = [...nextWithoutStudent[targetGroupIndex].studentIds];
    const insertIndex =
      targetSeatIndex == null
        ? targetIds.length
        : Math.min(Math.max(targetSeatIndex, 0), targetIds.length);
    targetIds.splice(insertIndex, 0, studentId);
    nextWithoutStudent[targetGroupIndex] = {
      ...nextWithoutStudent[targetGroupIndex],
      studentIds: targetIds,
    };
    clearRandomStatus();
    changeGroups(nextWithoutStudent);
    return true;
  }

  function moveToUnassigned(studentId: string) {
    if (disabled || !seatMap.has(studentId)) return false;
    clearRandomStatus();
    changeGroups(withoutStudent(studentId));
    return true;
  }

  function applyDrop(studentId: string, target: DropTarget) {
    if (disabled) {
      endDrag();
      return;
    }
    if (target.kind === "unassigned") moveToUnassigned(studentId);
    else if (target.kind === "seat") {
      moveDraggedStudent(studentId, target.groupIndex, target.seatIndex);
    } else {
      moveDraggedStudent(studentId, target.groupIndex);
    }
    endDrag();
  }

  function selectOrMoveStudent(
    event: MouseEvent<HTMLDivElement>,
    studentId: string,
    groupIndex: number,
    seatIndex: number,
  ) {
    event.stopPropagation();
    if (disabled) return;
    if (selectedStudentId && selectedStudentId !== studentId) {
      if (moveDraggedStudent(selectedStudentId, groupIndex, seatIndex)) {
        setSelectedStudentId(null);
      }
      return;
    }
    setSelectedStudentId(studentId);
  }

  function activateSeat(
    event: KeyboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
    groupIndex: number,
    seatIndex: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || !selectedStudentId) return;
    if (moveDraggedStudent(selectedStudentId, groupIndex, seatIndex)) {
      setSelectedStudentId(null);
    }
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
        name: groups[groupIndex]?.name?.trim() || `${groupIndex + 1}모둠`,
        studentIds,
      };
    });
    clearRandomStatus();
    onChange(next);
  }

  function setRatioTarget(
    setter: (value: number) => void,
    rawValue: string,
  ) {
    clearRandomStatus();
    const parsed = Number(rawValue);
    setter(
      Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0,
    );
  }

  function randomArrange() {
    if (disabled || pendingReveal) return;
    const result = arrangeSeating({
      students: assignedStudents,
      groups,
      pairMode,
      useGenderQuota,
      maleTarget,
      femaleTarget,
      fixedPairs,
      random: Math.random,
    });
    if (!result.ok) {
      setRandomStatusKind("error");
      setRandomStatus(result.error);
      return;
    }
    setRandomStatusKind("success");
    setRandomStatus(
      `${pairModeLabel(pairMode)} 조건으로 자리 배치했어요.${result.pairExceptions ? ` 짝 조건 예외 ${result.pairExceptions}쌍 (고정 짝 유지).` : ""}${
        unassigned.length > 0 ? ` 미배정 ${unassigned.length}명은 그대로 두었어요.` : ""
      }`,
    );
    setSelectedStudentId(null);
    if (!animationEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      changeGroups(result.groups);
    } else {
      setRevealProgress({ count: 0, shuffling: false });
      setPendingReveal(result.groups);
    }
    setToolsOpen(false);
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
    clearRandomStatus();
    setPairFirstId("");
    setPairSecondId("");
  }

  if (students.length === 0) {
    return <p className="seating-empty">학생을 먼저 추가하세요.</p>;
  }

  return (
    <div className="seating-editor">
      <div className="seating-toolbar">
        <button type="button" className="seating-tools-toggle" aria-label="연출 건너뛰기" title="연출 건너뛰기" disabled={!pendingReveal} onClick={() => { if (pendingReveal) { onChange(pendingReveal); setPendingReveal(null); } }}><SkipForward size={18} /></button>
        <button type="button" className="seating-tools-toggle" aria-label={muted ? "소리 켜기" : "소리 끄기"} title={muted ? "소리 켜기" : "소리 끄기"} aria-pressed={!muted} onClick={() => { setMuted(!muted); try { localStorage.setItem("seating-reveal-muted", String(!muted)); } catch {} }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <button type="button" className="seating-tools-toggle" aria-label={animationEnabled ? "애니메이션 끄기" : "애니메이션 켜기"} title={animationEnabled ? "애니메이션 끄기" : "애니메이션 켜기"} aria-pressed={animationEnabled} onClick={() => {
          setAnimationEnabled(!animationEnabled);
          try { localStorage.setItem("seating-animation-enabled", String(!animationEnabled)); } catch {}
          if (pendingReveal) { onChange(pendingReveal); setPendingReveal(null); }
        }}>{animationEnabled ? <Sparkles size={18} /> : <CircleOff size={18} />}</button>
        <button type="button" className="seating-random-action" onClick={randomArrange} disabled={disabled || !!pendingReveal}>자리 섞기</button>
        <button type="button" className="seating-tools-toggle" aria-expanded={toolsOpen} aria-controls="seating-tools-drawer" disabled={!!pendingReveal} onClick={() => setToolsOpen(open => !open)}>도구함</button>
        <div inert={pendingReveal ? true : undefined}>{toolbarActions}</div>
      </div>
      {pendingReveal && <SeatingReveal groups={pendingReveal} students={students} muted={muted} onProgress={updateReveal} onComplete={() => {
        onChange(pendingReveal);
        setPendingReveal(null);
        setPlacementRunId(0);
      }} />}
      <div className="seating-workspace" inert={pendingReveal ? true : undefined}>
        <section className="seating-classroom" aria-label="교실 자리 배치">
          <div className="seating-board-status">
            {boardStatus}
            {randomStatus && <p className={`seating-random-status is-${randomStatusKind}`} role="status" aria-live="polite">{randomStatus}</p>}
          </div>
          <div className="seating-board">
            <strong>{classroomName?.trim() || "우리 교실"}</strong>
            <span className="seating-board-label">칠판</span>
          </div>

          <div className="seating-chart-wrap">
            <div className={`seating-chart ${draggingStudentId ? "is-dragging" : ""}`}>
              {(pendingReveal ?? groups).map((group, groupIndex) => (
                <section
                  className={`seating-area seating-area--tone-${groupIndex % 6} ${
                    draggingStudentId ? "is-dragging" : ""
                  } ${
                    dropTarget?.kind === "area" && dropTarget.groupIndex === groupIndex
                      ? "is-drop-target"
                      : ""
                  }`}
                  key={`${group.name}-${groupIndex}`}
                  aria-label={`${group.name || `${groupIndex + 1}모둠`} 자리`}
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
                  onClick={(event) => {
                    if (event.target !== event.currentTarget || !selectedStudentId) return;
                    if (moveDraggedStudent(selectedStudentId, groupIndex)) {
                      setSelectedStudentId(null);
                    }
                  }}
                >
                  <div className="seating-area-head">
                    <h2>{group.name || `${groupIndex + 1}모둠`}</h2>
                    <span>{group.studentIds.length}명</span>
                  </div>
                  <div className="seating-area-grid">
                    {Array.from({
                      length: Math.max(GROUP_SIZE, group.studentIds.length),
                    }).map((_, seatIndex) => {
                      const studentId = group.studentIds[seatIndex];
                      const student = studentId ? studentMap.get(studentId) : null;
                      const revealIndex = (pendingReveal ?? groups).slice(0, groupIndex).reduce((sum, item) => sum + item.studentIds.length, 0) + seatIndex;
                      if (student && pendingReveal && revealIndex >= revealProgress.count) {
                        return <div key={`covered-${groupIndex}-${seatIndex}`} className={`seating-desk seating-reveal-covered ${revealProgress.shuffling ? "seating-reveal-shuffling" : ""}`} aria-label="공개 대기">?</div>;
                      }
                      const isSeatTarget =
                        dropTarget?.kind === "seat" &&
                        dropTarget.groupIndex === groupIndex &&
                        dropTarget.seatIndex === seatIndex;
                      if (!student) {
                        return (
                          <div
                            className={`seating-slot is-empty ${isSeatTarget ? "is-drop-target" : ""}`}
                            key={`empty-${groupIndex}-${seatIndex}`}
                            role={selectedStudentId ? "button" : undefined}
                            tabIndex={selectedStudentId ? 0 : -1}
                            aria-label={`${group.name || `${groupIndex + 1}모둠`} ${seatIndex + 1}번 자리`}
                            onClick={(event) => activateSeat(event, groupIndex, seatIndex)}
                            onKeyDown={(event) => {
                              if (isActivationKey(event)) activateSeat(event, groupIndex, seatIndex);
                            }}
                            onDragOver={(event) => {
                              if (disabled) return;
                              event.preventDefault();
                              event.stopPropagation();
                              highlightDropTarget({ kind: "seat", groupIndex, seatIndex });
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const droppedId = readDraggedId(event);
                              if (droppedId) applyDrop(droppedId, { kind: "seat", groupIndex, seatIndex });
                            }}
                          />
                        );
                      }
                      return (
                        <div
                          className={`seating-desk ${pendingReveal ? "seating-reveal-open" : ""} ${
                            draggingStudentId === student.id ? "is-dragging-card" : ""
                          } ${placementRunId > 0 ? "is-placing" : ""} ${
                            selectedStudentId === student.id ? "is-selected" : ""
                          } ${isSeatTarget && draggingStudentId !== student.id ? "is-swap-target" : ""}`}
                          key={`${student.id}-${placementRunId}`}
                          style={{
                            animationDelay: `${(groupIndex * GROUP_SIZE + seatIndex) * PLACEMENT_STEP_MS}ms`,
                            viewTransitionName: seatingTransitionName(student.id),
                          }}
                          draggable={!disabled}
                          role="button"
                          tabIndex={0}
                          aria-label={`${student.name} 자리`}
                          aria-pressed={selectedStudentId === student.id}
                          onClick={(event) =>
                            selectOrMoveStudent(event, student.id, groupIndex, seatIndex)
                          }
                          onKeyDown={(event) => {
                            if (!isActivationKey(event)) return;
                            if (disabled) return;
                            event.preventDefault();
                            if (selectedStudentId && selectedStudentId !== student.id) {
                              if (moveDraggedStudent(selectedStudentId, groupIndex, seatIndex)) {
                                setSelectedStudentId(null);
                              }
                            } else {
                              setSelectedStudentId(student.id);
                            }
                          }}
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
                            highlightDropTarget({ kind: "seat", groupIndex, seatIndex });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const droppedId = readDraggedId(event);
                            if (droppedId) applyDrop(droppedId, { kind: "seat", groupIndex, seatIndex });
                          }}
                        >
                          <span className="seating-desk-num">
                            {student.number != null ? String(student.number).padStart(2, "0") : "—"}
                          </span>
                          <span className="seating-desk-name">{student.name}</span>
                          <span className={`seating-gender is-${student.gender ?? "unknown"}`}>
                            {genderLabel(student.gender)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div
            className={`seating-unassigned ${draggingStudentId ? "is-dragging" : ""} ${
              dropTarget?.kind === "unassigned" ? "is-drop-target" : ""
            }`}
            aria-label="미배정 학생"
            onClick={(event) => {
              if (event.target !== event.currentTarget || !selectedStudentId) return;
              if (moveToUnassigned(selectedStudentId)) setSelectedStudentId(null);
            }}
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
            <div className="seating-unassigned-list">
              {unassigned.map((student) => (
                <div
                  className={`seating-desk is-unassigned ${selectedStudentId === student.id ? "is-selected" : ""}`}
                  key={student.id}
                  style={{ viewTransitionName: seatingTransitionName(student.id) }}
                  draggable={!disabled}
                  role="button"
                  tabIndex={0}
                  aria-label={`${student.name} 미배정 학생`}
                  aria-pressed={selectedStudentId === student.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled) setSelectedStudentId(student.id);
                  }}
                  onKeyDown={(event) => {
                    if (isActivationKey(event)) {
                      event.preventDefault();
                      if (!disabled) setSelectedStudentId(student.id);
                    }
                  }}
                  onDragStart={(event) => {
                    startStudentDrag(student.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", student.id);
                  }}
                  onDragEnd={endDrag}
                >
                  <span className="seating-desk-num">
                    {student.number != null ? String(student.number).padStart(2, "0") : "—"}
                  </span>
                  <span className="seating-desk-name">{student.name}</span>
                  <span className={`seating-gender is-${student.gender ?? "unknown"}`}>
                    {genderLabel(student.gender)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {mounted && createPortal(<>
        <div className={`seating-drawer-backdrop ${toolsOpen ? "is-open" : ""}`} aria-hidden="true" onClick={() => setToolsOpen(false)} />
        <aside id="seating-tools-drawer" className={`seating-sidebar seating-tools-drawer ${toolsOpen ? "is-open" : ""}`} inert={!toolsOpen ? true : undefined} aria-hidden={!toolsOpen} aria-label="자리 배치 도구" onKeyDown={event => {
          if (event.key === "Escape") { setToolsOpen(false); document.querySelector<HTMLButtonElement>('.seating-tools-toggle')?.focus(); }
        }}>
          <div className="seating-drawer-heading"><h2>도구함</h2><button type="button" aria-label="도구함 닫기" onClick={() => { setToolsOpen(false); document.querySelector<HTMLButtonElement>('.seating-tools-toggle')?.focus(); }}>닫기</button></div>
          <div className="seating-tool-card seating-tool-card--count">
            <span>모둠 수</span>
            <div className="seating-stepper">
              <button
                type="button"
                aria-label="모둠 수 줄이기"
                onClick={() => resizeGroups(groupCount - 1)}
                disabled={disabled || groupCount <= MIN_GROUP_COUNT}
              >
                −
              </button>
              <output aria-live="polite">{groupCount}</output>
              <button
                type="button"
                aria-label="모둠 수 늘리기"
                onClick={() => resizeGroups(groupCount + 1)}
                disabled={disabled || groupCount >= maxGroupCount}
              >
                ＋
              </button>
            </div>
          </div>
          <label className="seating-tool-card seating-tool-card--pair">
            <span>짝꿍 방식</span>
            <select
              value={pairMode}
              onChange={(event) => {
                clearRandomStatus();
                setPairMode(event.target.value as PairMode);
              }}
              disabled={disabled}
            >
              {PAIR_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <details className="seating-advanced" open={fixedPairs.length > 0}>
            <summary>고급 조건</summary>
            <div className="seating-advanced-body">
              <label className="seating-quota-toggle">
                <input
                  type="checkbox"
                  checked={useGenderQuota}
                  onChange={(event) => {
                    clearRandomStatus();
                    setUseGenderQuota(event.target.checked);
                  }}
                  disabled={disabled}
                />
                <span>모둠별 성비 (여 : 남)</span>
              </label>
              <div className="seating-ratio-inputs">
                <label>
                  <span>여</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={femaleTarget}
                    onChange={(event) => setRatioTarget(setFemaleTarget, event.target.value)}
                    disabled={disabled || !useGenderQuota}
                  />
                </label>
                <span aria-hidden="true">:</span>
                <label>
                  <span>남</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={maleTarget}
                    onChange={(event) => setRatioTarget(setMaleTarget, event.target.value)}
                    disabled={disabled || !useGenderQuota}
                  />
                </label>
              </div>
              <div className="seating-fixed-pair-controls">
                <label>
                  <span>고정 짝</span>
                  <select
                    value={pairFirstId}
                    onChange={(event) => {
                      clearRandomStatus();
                      setPairFirstId(event.target.value);
                    }}
                    disabled={disabled}
                  >
                    <option value="">학생 선택</option>
                    {pairableStudents.map((student) => (
                      <option value={student.id} key={student.id}>
                        {studentOptionLabel(student)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>함께</span>
                  <select
                    value={pairSecondId}
                    onChange={(event) => {
                      clearRandomStatus();
                      setPairSecondId(event.target.value);
                    }}
                    disabled={disabled || !pairFirstId}
                  >
                    <option value="">학생 선택</option>
                    {pairableStudents
                      .filter((student) => student.id !== pairFirstId)
                      .map((student) => (
                        <option value={student.id} key={student.id}>
                          {studentOptionLabel(student)}
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
              {fixedPairs.length > 0 && (
                <div className="seating-fixed-pair-list">
                  {fixedPairs.map((pair) => {
                    const invalid = pair.studentIds.some(
                      (studentId) => !assignedStudentIds.has(studentId),
                    );
                    return (
                      <span
                        className={`seating-fixed-pair-chip ${invalid ? "is-invalid" : ""}`}
                        key={pair.id}
                      >
                        {studentMap.get(pair.studentIds[0])?.name ?? "학생"} · {studentMap.get(pair.studentIds[1])?.name ?? "학생"}
                        {invalid ? <small>미배정</small> : null}
                        <button
                          type="button"
                          onClick={() => {
                            clearRandomStatus();
                            setFixedPairs((current) => current.filter((item) => item.id !== pair.id));
                          }}
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
          </details>

          {sidebarFooter ? <div className="seating-sidebar-footer">{sidebarFooter}</div> : null}
        </aside>
        </>, document.body)}
      </div>
    </div>
  );
}
