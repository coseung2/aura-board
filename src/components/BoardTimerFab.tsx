"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons/UiIcons";
import {
  fetchClassroomStudents,
  fetchToolkitClassrooms,
  onClassroomListChanged,
  onRosterChanged,
} from "@/lib/client-lookup-cache";

const PRESET_MINUTES = [1, 3, 5, 10, 15];
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
const PANEL_MARGIN = 12;
const MIN_PANEL_WIDTH = 280;
const MIN_PANEL_HEIGHT = 320;
const DEFAULT_PANEL_SIZE = { width: 320, height: 360 };

type ToolkitStudent = {
  id: string;
  name: string;
  number: number | null;
  gender?: "male" | "female" | null;
};

type ToolkitClassroom = {
  id: string;
  name: string;
  studentCount: number | null;
};

type PickerGenderFilter = "all" | "male" | "female";

type BoardToolkitFabProps = {
  classroomId?: string | null;
};

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function playTimerChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.85);
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    // Browsers can block audio in some contexts; the visual finished state is enough.
  }
}

function clampPanelGeometry(
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(MIN_PANEL_WIDTH, viewportWidth - PANEL_MARGIN * 2);
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, viewportHeight - PANEL_MARGIN * 2);
  const nextWidth = Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, width));
  const nextHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, height));
  return {
    left: Math.min(
      viewportWidth - PANEL_MARGIN - nextWidth,
      Math.max(PANEL_MARGIN, left),
    ),
    top: Math.min(
      viewportHeight - PANEL_MARGIN - nextHeight,
      Math.max(PANEL_MARGIN, top),
    ),
    width: nextWidth,
    height: nextHeight,
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function BoardToolkitFab(_props: BoardToolkitFabProps) {
  const [mounted, setMounted] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [panelSize, setPanelSize] = useState(DEFAULT_PANEL_SIZE);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<ToolkitClassroom[]>([]);
  const [classroomsLoaded, setClassroomsLoaded] = useState(false);
  const [classroomsError, setClassroomsError] = useState("");
  const [students, setStudents] = useState<ToolkitStudent[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentsClassroomId, setStudentsClassroomId] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState("");
  const [pickerCount, setPickerCount] = useState(1);
  const [pickerFilter, setPickerFilter] = useState<PickerGenderFilter>("all");
  const [pickedStudents, setPickedStudents] = useState<ToolkitStudent[]>([]);
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);
  const [drawingStudents, setDrawingStudents] = useState(false);
  const endAtRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const drawTimeoutsRef = useRef<number[]>([]);

  const durationSeconds = useMemo(() => minutes * 60, [minutes]);
  const timerLabel = finished ? "종료" : running ? "진행 중" : "대기";
  const activeClassroomId = selectedClassroomId;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return onClassroomListChanged(() => {
      setClassrooms([]);
      setClassroomsLoaded(false);
      setClassroomsError("");
    });
  }, []);

  useEffect(() => {
    return onRosterChanged(activeClassroomId, () => {
      setStudents([]);
      setStudentsLoaded(false);
      setStudentsClassroomId(null);
      setStudentsError("");
      setPickedStudents([]);
      setHighlightedStudentId(null);
    });
  }, [activeClassroomId]);

  useEffect(() => {
    if (!pickerOpen || classroomsLoaded || classroomsError) return;
    let cancelled = false;
    setClassroomsError("");
    fetchToolkitClassrooms()
      .then((nextClassrooms: ToolkitClassroom[]) => {
        if (cancelled) return;
        setClassrooms(nextClassrooms);
        setClassroomsLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setClassroomsError(
          error instanceof Error
            ? error.message
            : "학급 목록을 불러오지 못했어요.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [classroomsError, classroomsLoaded, pickerOpen]);

  useEffect(() => {
    if (
      !pickerOpen ||
      !activeClassroomId ||
      (studentsLoaded && studentsClassroomId === activeClassroomId) ||
      studentsError
    ) {
      return;
    }
    let cancelled = false;
    setStudentsError("");
    fetchClassroomStudents<ToolkitStudent>(activeClassroomId)
      .then((nextStudents) => {
        if (cancelled) return;
        setStudents(nextStudents);
        setStudentsLoaded(true);
        setStudentsClassroomId(activeClassroomId);
      })
      .catch((error) => {
        if (cancelled) return;
        setStudentsError(
          error instanceof Error
            ? error.message
            : "학생 명단을 불러오지 못했어요.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [activeClassroomId, pickerOpen, studentsClassroomId, studentsError, studentsLoaded]);

  useEffect(() => {
    if (!running) return;

    const intervalId = window.setInterval(() => {
      if (!endAtRef.current) return;
      const nextRemaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);

      if (nextRemaining === 0) {
        endAtRef.current = null;
        setRunning(false);
        setFinished(true);
        playTimerChime();
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [running]);

  useEffect(() => {
    return () => {
      drawTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      drawTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    function keepPanelInViewport() {
      setPanelPosition((current) => {
        if (!current) return current;
        const next = clampPanelGeometry(
          current.left,
          current.top,
          panelSize.width,
          panelSize.height,
        );
        setPanelSize({ width: next.width, height: next.height });
        return { left: next.left, top: next.top };
      });
    }

    window.addEventListener("resize", keepPanelInViewport);
    return () => window.removeEventListener("resize", keepPanelInViewport);
  }, [panelSize.height, panelSize.width]);

  const setDuration = (nextMinutes: number) => {
    const safeMinutes = clampMinutes(nextMinutes);
    endAtRef.current = null;
    setMinutes(safeMinutes);
    setRemainingSeconds(safeMinutes * 60);
    setRunning(false);
    setFinished(false);
  };

  const startTimer = () => {
    const secondsToRun = remainingSeconds > 0 ? remainingSeconds : durationSeconds;
    setRemainingSeconds(secondsToRun);
    endAtRef.current = Date.now() + secondsToRun * 1000;
    setRunning(true);
    setFinished(false);
  };

  const pauseTimer = () => {
    if (endAtRef.current) {
      setRemainingSeconds(Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000)));
    }
    endAtRef.current = null;
    setRunning(false);
  };

  const resetTimer = () => {
    endAtRef.current = null;
    setRemainingSeconds(durationSeconds);
    setRunning(false);
    setFinished(false);
  };

  const eligibleStudents = useMemo(() => {
    if (pickerFilter === "all") return students;
    return students.filter((student) => student.gender === pickerFilter);
  }, [pickerFilter, students]);
  const pickedStudentIds = useMemo(
    () => new Set(pickedStudents.map((student) => student.id)),
    [pickedStudents],
  );

  const safePickerCount = Math.min(
    Math.max(1, pickerCount),
    Math.max(1, eligibleStudents.length),
  );

  const drawStudents = () => {
    if (eligibleStudents.length === 0 || drawingStudents) return;
    drawTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    drawTimeoutsRef.current = [];
    setDrawingStudents(true);
    setPickedStudents([]);
    setHighlightedStudentId(null);

    const shuffled = [...eligibleStudents];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    const winners = shuffled.slice(0, safePickerCount);
    const sequenceLength = Math.min(18 + winners.length * 4, Math.max(18, eligibleStudents.length * 3));
    const sequence = Array.from({ length: sequenceLength }, () => {
      const index = Math.floor(Math.random() * eligibleStudents.length);
      return eligibleStudents[index].id;
    });
    winners.forEach((student) => sequence.push(student.id));

    sequence.forEach((studentId, index) => {
      const timeoutId = window.setTimeout(() => {
        setHighlightedStudentId(studentId);
        const winnerIndex = winners.findIndex((student) => student.id === studentId);
        if (index >= sequence.length - winners.length && winnerIndex >= 0) {
          setPickedStudents(winners.slice(0, winnerIndex + 1));
        }
        if (index === sequence.length - 1) {
          window.setTimeout(() => {
            setHighlightedStudentId(null);
            setDrawingStudents(false);
          }, 260);
        }
      }, index * 95);
      drawTimeoutsRef.current.push(timeoutId);
    });
  };

  const chooseClassroom = (nextClassroomId: string) => {
    drawTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    drawTimeoutsRef.current = [];
    setSelectedClassroomId(nextClassroomId || null);
    setStudents([]);
    setStudentsLoaded(false);
    setStudentsClassroomId(null);
    setStudentsError("");
    setPickedStudents([]);
    setHighlightedStudentId(null);
    setDrawingStudents(false);
  };

  const openTool = (tool: "timer" | "picker") => {
    setToolMenuOpen(false);
    if (tool === "timer") {
      setTimerOpen(true);
      setPickerOpen(false);
    } else {
      setPickerOpen(true);
      setTimerOpen(false);
    }
  };

  const beginPanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !panelRef.current) return;
    event.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const move = (moveEvent: PointerEvent) => {
      const next = clampPanelGeometry(
        startLeft + moveEvent.clientX - startX,
        startTop + moveEvent.clientY - startY,
        rect.width,
        rect.height,
      );
      setPanelPosition({ left: next.left, top: next.top });
      setPanelSize({ width: next.width, height: next.height });
    };

    const stop = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const beginPanelResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !panelRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panelRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const move = (moveEvent: PointerEvent) => {
      const next = clampPanelGeometry(
        rect.left,
        rect.top,
        rect.width + moveEvent.clientX - startX,
        rect.height + moveEvent.clientY - startY,
      );
      setPanelPosition({ left: next.left, top: next.top });
      setPanelSize({ width: next.width, height: next.height });
    };

    const stop = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const panelStyle: CSSProperties = {
    width: panelPosition
      ? panelSize.width
      : `min(${panelSize.width}px, calc(100vw - 32px))`,
    height: panelPosition
      ? panelSize.height
      : `min(${panelSize.height}px, calc(100vh - 96px))`,
    ...(panelPosition
      ? {
          left: panelPosition.left,
          top: panelPosition.top,
          right: "auto",
          bottom: "auto",
        }
      : null),
  };

  const panel = (
    <section
      ref={(element) => {
        panelRef.current = element;
      }}
      className={`board-timer-panel${finished ? " is-finished" : ""}`}
      role="dialog"
      aria-label="타이머"
      style={panelStyle}
    >
      <div className="board-timer-header">
        <button
          type="button"
          className="board-timer-drag-handle"
          onPointerDown={beginPanelDrag}
          aria-label="타이머 이동"
          title="타이머 이동"
        >
          <p className="board-timer-kicker">타이머</p>
          <strong className="board-timer-status">{timerLabel}</strong>
        </button>
        <button
          type="button"
          className="board-timer-close"
          onClick={() => setTimerOpen(false)}
          aria-label="타이머 닫기"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="board-timer-content">
        <output className="board-timer-display" aria-live="polite">
          {formatTimer(remainingSeconds)}
        </output>

        <div className="board-timer-presets" aria-label="타이머 빠른 설정">
          {PRESET_MINUTES.map((preset) => (
            <button
              key={preset}
              type="button"
              className={preset === minutes ? "is-selected" : ""}
              onClick={() => setDuration(preset)}
            >
              {preset}분
            </button>
          ))}
        </div>

        <label className="board-timer-input">
          <span>시간</span>
          <input
            type="number"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            value={minutes}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
          <span>분</span>
        </label>

        <div className="board-timer-actions">
          {running ? (
            <button type="button" className="board-timer-primary" onClick={pauseTimer}>
              일시정지
            </button>
          ) : (
            <button type="button" className="board-timer-primary" onClick={startTimer}>
              시작
            </button>
          )}
          <button type="button" className="board-timer-secondary" onClick={resetTimer}>
            초기화
          </button>
        </div>
      </div>
      <button
        type="button"
        className="board-timer-resize-handle"
        onPointerDown={beginPanelResize}
        aria-label="타이머 크기 조절"
        title="타이머 크기 조절"
      />
    </section>
  );

  const pickerPanel = (
    <section
      className="board-toolkit-panel board-student-picker-panel"
      role="dialog"
      aria-label="학생 랜덤뽑기"
    >
      <div className="board-timer-header">
        <div>
          <p className="board-timer-kicker">툴킷</p>
          <strong className="board-timer-status">학생 랜덤뽑기</strong>
        </div>
        <button
          type="button"
          className="board-timer-close"
          onClick={() => setPickerOpen(false)}
          aria-label="학생 랜덤뽑기 닫기"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="board-picker-content">
        {classroomsError ? (
          <p className="board-toolkit-empty">{classroomsError}</p>
        ) : !classroomsLoaded ? (
          <p className="board-toolkit-empty">학급 목록을 불러오는 중...</p>
        ) : classrooms.length === 0 ? (
          <p className="board-toolkit-empty">선택할 수 있는 학급이 없어요.</p>
        ) : (
          <label className="board-classroom-picker">
            <span>학급</span>
            <select
              value={activeClassroomId ?? ""}
              onChange={(event) => chooseClassroom(event.target.value)}
            >
              <option value="" disabled>
                학급 선택
              </option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                  {typeof classroom.studentCount === "number"
                    ? ` · ${classroom.studentCount}명`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {!activeClassroomId ? (
          classroomsLoaded && classrooms.length > 0 ? (
            <p className="board-toolkit-empty">학급을 선택하면 학생 명단을 불러와요.</p>
          ) : null
        ) : studentsError ? (
          <p className="board-toolkit-empty">{studentsError}</p>
        ) : !studentsLoaded ? (
          <p className="board-toolkit-empty">학생 명단을 불러오는 중...</p>
        ) : students.length === 0 ? (
          <p className="board-toolkit-empty">뽑을 학생이 없어요.</p>
        ) : (
          <>
            <div className="board-picker-controls">
              <label>
                <span>인원</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, eligibleStudents.length)}
                  value={safePickerCount}
                  onChange={(event) =>
                    setPickerCount(Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </label>
              <label>
                <span>대상</span>
                <select
                  value={pickerFilter}
                  onChange={(event) => {
                    drawTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
                    drawTimeoutsRef.current = [];
                    setPickerFilter(event.target.value as PickerGenderFilter);
                    setPickedStudents([]);
                    setHighlightedStudentId(null);
                    setDrawingStudents(false);
                  }}
                >
                  <option value="all">전체</option>
                  <option value="female">여</option>
                  <option value="male">남</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              className="board-timer-primary board-picker-draw"
              onClick={drawStudents}
              disabled={eligibleStudents.length === 0 || drawingStudents}
            >
              {drawingStudents ? "뽑는 중..." : "뽑기"}
            </button>

            {eligibleStudents.length === 0 ? (
              <p className="board-toolkit-empty">조건에 맞는 학생이 없어요.</p>
            ) : (
              <>
                <div className="board-picker-roster" aria-live="polite">
                  {eligibleStudents.map((student) => {
                    const isPicked = pickedStudentIds.has(student.id);
                    const isHighlighted = highlightedStudentId === student.id;
                    return (
                      <div
                        key={student.id}
                        className={[
                          "board-picker-student-card",
                          isPicked ? "is-picked" : "",
                          isHighlighted ? "is-highlighted" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <span>{student.number ?? "-"}</span>
                        <strong>{student.name}</strong>
                      </div>
                    );
                  })}
                </div>
                {pickedStudents.length > 0 ? (
                  <p className="board-picker-summary">
                    {pickedStudents.map((student) => student.name).join(", ")}
                  </p>
                ) : (
                  <p className="board-toolkit-empty">뽑기를 누르면 카드 위에서 순서대로 표시돼요.</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );

  const toolMenu = (
    <div className="board-toolkit-menu" role="menu" aria-label="툴킷 도구">
      <button type="button" role="menuitem" onClick={() => openTool("timer")}>
        <span aria-hidden="true">⏱</span>
        <strong>타이머</strong>
      </button>
      <button type="button" role="menuitem" onClick={() => openTool("picker")}>
        <span aria-hidden="true">🎲</span>
        <strong>학생 랜덤뽑기</strong>
      </button>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={`board-toolkit-fab${running ? " is-running" : ""}${finished ? " is-finished" : ""}`}
        onClick={() => setToolMenuOpen((value) => !value)}
        aria-label="툴킷"
        aria-expanded={toolMenuOpen}
      >
        <span aria-hidden="true">🧰</span>
      </button>
      {mounted && toolMenuOpen ? createPortal(toolMenu, document.body) : null}
      {mounted && timerOpen ? createPortal(panel, document.body) : null}
      {mounted && pickerOpen ? createPortal(pickerPanel, document.body) : null}
    </>
  );
}

export function BoardTimerFab(props: BoardToolkitFabProps) {
  return <BoardToolkitFab {...props} />;
}
