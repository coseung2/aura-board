"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CalendarDays, ChevronsDown, UserRoundX } from "lucide-react";
import { useClassroomMorningDashboard } from "./useClassroomMorningDashboard";
import { ToastProvider, useToast } from "@/components/ui/Toast";

export const CLASSROOM_ASSIGNMENTS_CHANGED_EVENT =
  "aura:classroom-assignments-changed";

const KIND_LABELS = {
  check: "제출 과제",
  board: "보드 과제",
} as const;

type CheckTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isActive: boolean;
  submittedCount: number;
  totalStudents: number;
};

type CheckTaskListResponse = { tasks: CheckTask[] };

type CheckTaskDetailResponse = {
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  roster: Array<{
    student: { id: string; name: string; number: number | null };
    submission: { submitted: boolean } | null;
  }>;
};

type BoardItem = {
  id: string;
  kind: "board" | "section";
  title: string;
  /** 원본 제목 (섹션 과제의 "제목 (보드명)" 전체) — 호버 툴팁용. */
  fullTitle: string;
  /** 섹션 과제가 속한 보드 이름 — 파란 라벨로 표시. */
  boardName: string | null;
  dueDate: string | null;
  students: Array<{ id: string; name: string; number: number | null }>;
};

type Props = {
  classroomId: string;
};

function formatDueDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR");
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Full-width assignments page (2026-08-12): a flat 3-column store-style grid
 * with fixed-size cards. Each card's title row carries the missing count, due
 * date, and (for 제출 과제) the 마감 toggle; the body spreads the missing
 * students in a 3-column grid. Distribution happens through the header button
 * (ClassroomAssignmentDistributeButton).
 */
export function ClassroomAssignmentsView({ classroomId }: Props) {
  return (
    <ToastProvider>
      <ClassroomAssignmentsViewInner classroomId={classroomId} />
    </ToastProvider>
  );
}

function ClassroomAssignmentsViewInner({ classroomId }: Props) {
  const toast = useToast();
  const { summary, loaded, error, refresh } = useClassroomMorningDashboard({
    classroomId,
    sections: ["assignments"],
  });

  const [checkTasks, setCheckTasks] = useState<CheckTask[] | null>(null);
  const [checksError, setChecksError] = useState<string | null>(null);
  // 체크 과제별 미제출 학생 명단. morning-summary는 마감일이 미래인 과제를
  // 제외하므로, 상세 명단 API로 직접 계산한다 (2026-08-12).
  const [missingByTaskId, setMissingByTaskId] = useState<
    ReadonlyMap<string, Array<{ id: string; name: string; number: number | null }>>
  >(new Map());
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  // 미제출 명단이 카드 영역을 넘치는 과제 id (스크롤 대신 펼치기 버튼 표시).
  const [overflowingIds, setOverflowingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const expandedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const namesRefs = useMemo(
    () => ({ current: new Map<string, HTMLElement | null>() }),
    [],
  );
  // 이번 세션에서 아카이빙한 보드/섹션 과제 id (서버 반영 후 즉시 숨김).
  const [archivedBoardIds, setArchivedBoardIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const loadChecks = useCallback(async () => {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/checks`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("제출 과제 목록을 불러오지 못했어요.");
      }
      const data = (await res.json()) as CheckTaskListResponse;
      const activeTasks = data.tasks.filter((task) => task.isActive);
      const rosters = await Promise.all(
        activeTasks.map(async (task) => {
          const detailRes = await fetch(
            `/api/classrooms/${classroomId}/checks/${encodeURIComponent(task.id)}`,
            { cache: "no-store" },
          );
          if (!detailRes.ok) return { taskId: task.id, students: [] };
          const detail = (await detailRes.json()) as CheckTaskDetailResponse;
          return {
            taskId: task.id,
            students: detail.roster
              .filter((entry) => !entry.submission?.submitted)
              .map((entry) => entry.student),
          };
        }),
      );
      setMissingByTaskId(
        new Map(rosters.map((roster) => [roster.taskId, roster.students])),
      );
      setCheckTasks(data.tasks);
      setChecksError(null);
    } catch (reason) {
      setChecksError(
        reason instanceof Error ? reason.message : "제출 과제 목록을 불러오지 못했어요.",
      );
    }
  }, [classroomId]);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  // 배부 버튼(헤더)이 배부를 마치면 이벤트로 알려준다.
  useEffect(() => {
    const handler = () => {
      // 서버 상태가 기준이므로 세션 중 아카이빙 표시를 비운다. 드로어에서
      // 복원한 과제가 새로고침 없이 목록에 돌아오게 하기 위함.
      setArchivedBoardIds(new Set());
      void loadChecks();
      void refresh();
    };
    window.addEventListener(CLASSROOM_ASSIGNMENTS_CHANGED_EVENT, handler);
    return () =>
      window.removeEventListener(CLASSROOM_ASSIGNMENTS_CHANGED_EVENT, handler);
  }, [loadChecks, refresh]);

  const boardItems = useMemo<BoardItem[]>(() => {
    const out: BoardItem[] = [];
    for (const item of summary?.missingAssignmentBoards ?? []) {
      for (const board of item.boards) {
        let section = out.find((candidate) => candidate.id === board.id);
        if (!section) {
          section = {
            id: board.id,
            kind: board.kind,
            fullTitle: board.title,
            boardName: board.boardName,
            // 섹션 과제는 "제목 (보드명)"으로 내려오는데, 파란 "보드 과제"
            // 라벨이 보드 소속을 이미 나타내므로 괄호 부분을 제거한다.
            title:
              board.kind === "section"
                ? board.title.replace(/\s*\([^)]*\)\s*$/, "")
                : board.title,
            dueDate: board.dueDate,
            students: [],
          };
          out.push(section);
        }
        section.students.push(item.student);
      }
    }
    return out;
  }, [summary]);

  // 아카이빙된(비활성) 제출 과제는 노출하지 않는다.
  const checkItems = useMemo(
    () =>
      (checkTasks ?? [])
        .filter((task) => task.isActive)
        .map((task) => ({
        kind: "check" as const,
        ...task,
        missingStudents: missingByTaskId.get(task.id) ?? [],
      })),
    [checkTasks, missingByTaskId],
  );

  const isEmpty =
    loaded &&
    checkTasks !== null &&
    checkItems.length === 0 &&
    boardItems.filter((item) => !archivedBoardIds.has(item.id)).length === 0;

  // 카드가 접힌 상태에서 명단이 넘치는지 측정한다. 확장 상태에서는 버튼을
  // 유지(접기 가능)하기 위해 측정 결과를 다시 지우지 않는다.
  useEffect(() => {
    const measure = () => {
      const next = new Set<string>();
      for (const [id, element] of namesRefs.current) {
        if (element && element.scrollHeight > element.clientHeight + 1) {
          next.add(id);
        }
      }
      // 펼친 항목은 다시 측정해도 버튼을 유지해서 접을 수 있게 한다.
      for (const id of expandedIdsRef.current) next.add(id);
      setOverflowingIds(next);
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      for (const element of namesRefs.current.values()) {
        if (element) observer.observe(element);
      }
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [checkItems, boardItems, namesRefs]);

  function toggleExpand(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      expandedIdsRef.current = next;
      return next;
    });
  }

  async function handleToggleCheck(task: CheckTask) {
    if (toggleBusyId) return;
    setToggleBusyId(task.id);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/checks/${encodeURIComponent(task.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isActive: !task.isActive }),
        },
      );
      if (!res.ok) {
        throw new Error("과제 상태를 변경하지 못했어요.");
      }
      // 마감 = 아카이빙: 목록에서 제거한다.
      setCheckTasks((current) =>
        current?.filter((item) => item.id !== task.id) ?? current,
      );
      toast.show({
        variant: "info",
        message: `'${task.title}' 과제를 마감했어요. 목록에서 비활성화되고 보관함에서 복구할 수 있어요.`,
      });
    } catch (reason) {
      setChecksError(
        reason instanceof Error ? reason.message : "과제 상태를 변경하지 못했어요.",
      );
    } finally {
      setToggleBusyId(null);
    }
  }

  async function handleArchiveBoard(item: BoardItem) {
    if (toggleBusyId) return;
    setToggleBusyId(item.id);
    try {
      const path =
        item.kind === "section"
          ? `/api/sections/${encodeURIComponent(item.id)}`
          : `/api/boards/${encodeURIComponent(item.id)}`;
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentArchivedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        throw new Error("과제 상태를 변경하지 못했어요.");
      }
      setArchivedBoardIds((current) => new Set(current).add(item.id));
      toast.show({
        variant: "info",
        message: `'${item.title}' 과제를 마감했어요. 목록에서 비활성화되고 보관함에서 복구할 수 있어요.`,
      });
    } catch (reason) {
      setChecksError(
        reason instanceof Error ? reason.message : "과제 상태를 변경하지 못했어요.",
      );
    } finally {
      setToggleBusyId(null);
    }
  }

  const pageError = error ?? checksError;

  return (
    <section className="classroom-assignments-view">
      {!loaded || checkTasks === null ? (
        <p className="classroom-feature-empty" role="status">
          불러오는 중…
        </p>
      ) : pageError ? (
        <p className="classroom-feature-empty classroom-assignments-error" role="alert">
          {pageError}
        </p>
      ) : isEmpty ? (
        <p className="classroom-feature-empty">
          아직 배부된 과제가 없어요. &ldquo;+ 과제 배부&rdquo;로 시작해 보세요.
        </p>
      ) : (
        <div className="classroom-assignments-grid">
          {checkItems.map((item) => {
            const missingCount = item.missingStudents.length;
            return (
              <article
                key={item.id}
                className={`classroom-assignment-item is-check${
                  expandedIds.has(item.id) ? " is-expanded" : ""
                }`}
              >
                <header className="classroom-assignment-item-head">
                  <div className="classroom-assignment-item-title">
                    <div className="classroom-assignment-item-kind-row">
                      <span className="classroom-assignment-kind kind-check">
                        {KIND_LABELS.check}
                      </span>
                      <span className="classroom-assignment-meta-item">
                        <UserRoundX size={12} strokeWidth={2} aria-hidden="true" />
                        <span>{missingCount}명</span>
                      </span>
                      {item.dueDate ? (
                        <span className="classroom-assignment-meta-item">
                          <CalendarDays
                            size={14}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          <span>{formatDueDate(item.dueDate)}</span>
                        </span>
                      ) : null}
                    </div>
                    <h3 title={item.title}>{item.title}</h3>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={true}
                    aria-label={`${item.title} 마감`}
                    className="classroom-assignment-toggle"
                    onClick={() => void handleToggleCheck(item)}
                    disabled={toggleBusyId !== null}
                  >
                    <span
                      className="classroom-assignment-toggle-track"
                      aria-hidden="true"
                    >
                      <span className="classroom-assignment-toggle-thumb" />
                    </span>
                  </button>
                </header>
                <div className="classroom-assignment-item-body">
                  {missingCount > 0 ? (
                    <ul
                      className="classroom-assignment-names"
                      ref={(element) => {
                        if (element) namesRefs.current.set(item.id, element);
                        else namesRefs.current.delete(item.id);
                      }}
                    >
                      {item.missingStudents.map((student) => (
                        <li key={student.id} className="classroom-assignment-name">
                          {student.number ? (
                            <span className="morning-list-num">{student.number}</span>
                          ) : null}
                          <span>{student.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {overflowingIds.has(item.id) ? (
                    <button
                      type="button"
                      className="classroom-assignment-expand"
                      aria-expanded={expandedIds.has(item.id)}
                      aria-label={`${item.title} 미제출 명단 ${
                        expandedIds.has(item.id) ? "접기" : "펼치기"
                      }`}
                      onClick={() => toggleExpand(item.id)}
                    >
                      <ChevronsDown size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}

          {boardItems
            .filter((item) => !archivedBoardIds.has(item.id))
            .map((item) => (
              <article
                key={item.id}
                className={`classroom-assignment-item is-board${
                  expandedIds.has(item.id) ? " is-expanded" : ""
                }`}
              >
                <header className="classroom-assignment-item-head">
                  <div className="classroom-assignment-item-title">
                    <div className="classroom-assignment-item-kind-row">
                      <span className="classroom-assignment-kind kind-board">
                        {item.kind === "section" && item.boardName
                          ? item.boardName
                          : KIND_LABELS.board}
                      </span>
                      <span className="classroom-assignment-meta-item">
                        <UserRoundX size={12} strokeWidth={2} aria-hidden="true" />
                        <span>{item.students.length}명</span>
                      </span>
                      {item.dueDate ? (
                        <span className="classroom-assignment-meta-item">
                          <CalendarDays
                            size={14}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          <span>{formatDueDate(item.dueDate)}</span>
                        </span>
                      ) : null}
                    </div>
                    <h3 title={item.fullTitle}>{item.title}</h3>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={true}
                    aria-label={`${item.title} 마감`}
                    className="classroom-assignment-toggle"
                    onClick={() => void handleArchiveBoard(item)}
                    disabled={toggleBusyId !== null}
                  >
                    <span
                      className="classroom-assignment-toggle-track"
                      aria-hidden="true"
                    >
                      <span className="classroom-assignment-toggle-thumb" />
                    </span>
                  </button>
                </header>
                <div className="classroom-assignment-item-body">
                  {item.students.length > 0 ? (
                    <ul
                      className="classroom-assignment-names"
                      ref={(element) => {
                        if (element) namesRefs.current.set(item.id, element);
                        else namesRefs.current.delete(item.id);
                      }}
                    >
                      {item.students.map((student) => (
                        <li key={student.id} className="classroom-assignment-name">
                          {student.number ? (
                            <span className="morning-list-num">{student.number}</span>
                          ) : null}
                          <span>{student.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {overflowingIds.has(item.id) ? (
                    <button
                      type="button"
                      className="classroom-assignment-expand"
                      aria-expanded={expandedIds.has(item.id)}
                      aria-label={`${item.title} 미제출 명단 ${
                        expandedIds.has(item.id) ? "접기" : "펼치기"
                      }`}
                      onClick={() => toggleExpand(item.id)}
                    >
                      <ChevronsDown size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}

/**
 * Header action for the assignments page: "+ 과제 배부" opens the same
 * check-task distribution form and broadcasts CLASSROOM_ASSIGNMENTS_CHANGED
 * so the view refreshes without owning the button.
 */
export function ClassroomAssignmentDistributeButton({
  classroomId,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="check-add" onClick={() => setOpen(true)}>
        + 과제 배부
      </button>
      {open ? (
        <DistributeAssignmentForm
          classroomId={classroomId}
          onCancel={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            window.dispatchEvent(
              new Event(CLASSROOM_ASSIGNMENTS_CHANGED_EVENT),
            );
          }}
        />
      ) : null}
    </>
  );
}

function DistributeAssignmentForm({
  classroomId,
  onCancel,
  onSaved,
}: {
  classroomId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/checks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || null,
          dueDate: dateInputToIso(dueDate),
        }),
      });
      if (!res.ok) {
        throw new Error("과제를 배부하지 못했어요.");
      }
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "과제를 배부하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="과제 배부"
    >
      <form className="check-editor" onSubmit={handleSubmit}>
        <header className="check-editor-header">
          <h3>과제 배부</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onCancel}
            disabled={busy}
          >
            ×
          </button>
        </header>
        <label className="check-editor-field">
          <span>제목</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
        </label>
        <label className="check-editor-field">
          <span>설명 (선택)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            rows={3}
          />
        </label>
        <label className="check-editor-field">
          <span>마감일 (선택)</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        {error ? (
          <p className="classroom-assignments-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="check-editor-footer">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "배부 중…" : "배부"}
          </button>
        </footer>
      </form>
    </div>
  );
}

type ArchivedItem = {
  id: string;
  kind: "check" | "board" | "section";
  title: string;
  dueDate: string | null;
  archivedAt: string;
  boardName: string | null;
  missingCount: number;
};

/**
 * 헤더의 보관함 버튼 + 드로어. 마감(아카이빙)된 과제를 보고, 복원할 수 있다.
 * 복원 시 CLASSROOM_ASSIGNMENTS_CHANGED_EVENT를 쏴서 목록을 갱신한다.
 */
export function ArchivedAssignmentsButton({ classroomId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="classroom-archive-open"
        onClick={() => setOpen(true)}
      >
        <Archive size={15} strokeWidth={2} aria-hidden="true" />
        보관함
      </button>
      {open ? (
        <ArchivedAssignmentsDrawer
          classroomId={classroomId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ArchivedAssignmentsDrawer({
  classroomId,
  onClose,
}: {
  classroomId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ArchivedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/assignments/archived`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error("보관함을 불러오지 못했어요.");
      }
      const data = (await res.json()) as { items: ArchivedItem[] };
      setItems(data.items);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "보관함을 불러오지 못했어요.",
      );
    }
  }, [classroomId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(item: ArchivedItem) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const path =
        item.kind === "check"
          ? `/api/classrooms/${classroomId}/checks/${encodeURIComponent(item.id)}`
          : item.kind === "section"
            ? `/api/sections/${encodeURIComponent(item.id)}`
            : `/api/boards/${encodeURIComponent(item.id)}`;
      const body =
        item.kind === "check"
          ? JSON.stringify({ isActive: true })
          : JSON.stringify({ assignmentArchivedAt: null });
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!res.ok) {
        throw new Error("복원하지 못했어요.");
      }
      setItems((current) =>
        current?.filter((entry) => entry.id !== item.id) ?? current,
      );
      window.dispatchEvent(new Event(CLASSROOM_ASSIGNMENTS_CHANGED_EVENT));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "복원하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="classroom-archive-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="classroom-archive-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="보관함"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="classroom-archive-header">
          <h2>보관함</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="보관함 닫기"
          >
            ×
          </button>
        </header>

        {items === null && !error ? (
          <p className="classroom-archive-empty" role="status">
            불러오는 중…
          </p>
        ) : error ? (
          <p
            className="classroom-archive-empty classroom-assignments-error"
            role="alert"
          >
            {error}
          </p>
        ) : (items ?? []).length === 0 ? (
          <p className="classroom-archive-empty">보관된 과제가 없어요.</p>
        ) : (
          <ul className="classroom-archive-list">
            {(items ?? []).map((item) => {
              const displayTitle =
                item.kind === "section"
                  ? item.title.replace(/\s*\([^)]*\)\s*$/, "")
                  : item.title;
              const kindLabel =
                item.kind === "check"
                  ? KIND_LABELS.check
                  : item.kind === "section" && item.boardName
                    ? item.boardName
                    : KIND_LABELS.board;
              return (
                <li key={item.id} className="classroom-archive-row">
                  <div className="classroom-archive-copy">
                    <div className="classroom-archive-title-line">
                      <span
                        className={`classroom-assignment-kind ${
                          item.kind === "check" ? "kind-check" : "kind-board"
                        }`}
                      >
                        {kindLabel}
                      </span>
                      <strong title={item.title}>{displayTitle}</strong>
                    </div>
                    <span className="classroom-archive-meta">
                      미제출 {item.missingCount}명 ·{" "}
                      {item.dueDate
                        ? `마감 ${formatDueDate(item.dueDate)} · `
                        : ""}
                      보관 {new Date(item.archivedAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="classroom-archive-restore"
                    onClick={() => void handleRestore(item)}
                    disabled={busyId !== null}
                  >
                    {busyId === item.id ? "복원 중…" : "복원"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
