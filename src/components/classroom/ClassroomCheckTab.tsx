"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CheckTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isActive: boolean;
  submittedCount: number;
  totalStudents: number;
  createdAt: string;
};

type TaskListResponse = { tasks: CheckTask[] };

type RosterEntry = {
  student: { id: string; name: string; number: number | null };
  submission: {
    id: string;
    submitted: boolean;
    checkedAt: string | null;
    checkedById: string | null;
  } | null;
};

type TaskDetailResponse = {
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  roster: RosterEntry[];
};

type Props = {
  classroomId: string;
  canManageTasks: boolean;
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // yyyy-mm-dd in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Treat as local midnight to avoid off-by-one from UTC parsing.
  const d = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ClassroomCheckTab({ classroomId, canManageTasks }: Props) {
  const [tasks, setTasks] = useState<CheckTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<CheckTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setListError(null);
    const res = await fetch(`/api/classrooms/${classroomId}/checks`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error;
      setListError(typeof msg === "string" ? msg : "목록을 불러오지 못했어요.");
      setLoaded(true);
      return;
    }
    const data = (await res.json()) as TaskListResponse;
    setTasks(data.tasks);
    setLoaded(true);
  }, [classroomId]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  async function handleToggleActive(task: CheckTask) {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/checks/${task.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isActive: !task.isActive }),
        }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setListError(typeof msg === "string" ? msg : "상태 변경 실패");
        return;
      }
      const data = (await res.json()) as { task: CheckTask };
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, ...data.task } : t))
      );
      setToast(task.isActive ? "비활성화됨" : "활성화됨");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(task: CheckTask) {
    if (!window.confirm(`'${task.title}' 체크를 삭제할까요?`)) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/checks/${task.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setListError(typeof msg === "string" ? msg : "삭제 실패");
        return;
      }
      if (selectedTaskId === task.id) setSelectedTaskId(null);
      setToast("삭제됨");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDraft(draft: {
    title: string;
    description?: string;
    dueDate?: string | null;
  }) {
    setBusy(true);
    setToast(null);
    try {
      const isEdit = editingTask !== null;
      const url = isEdit
        ? `/api/classrooms/${classroomId}/checks/${editingTask!.id}`
        : `/api/classrooms/${classroomId}/checks`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description ?? null,
          dueDate: draft.dueDate ?? null,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setListError(typeof msg === "string" ? msg : "저장 실패");
        return;
      }
      setCreating(false);
      setEditingTask(null);
      setToast(isEdit ? "수정됨" : "추가됨");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  return (
    <section className="classroom-check">
      <header className="check-header">
        <h2>제출 체크</h2>
        {canManageTasks && (
          <div className="check-header-actions">
            <button
              type="button"
              className="check-add"
              onClick={() => setCreating(true)}
              disabled={busy}
            >
              + 체크 추가
            </button>
          </div>
        )}
      </header>

      {!loaded ? (
        <p className="check-loading">불러오는 중…</p>
      ) : listError ? (
        <p className="check-error">{listError}</p>
      ) : tasks.length === 0 ? (
        <p className="check-empty">
          {canManageTasks
            ? "등록된 체크가 없어요. '체크 추가'로 시작해 보세요."
            : "진행 중인 제출 체크가 없어요."}
        </p>
      ) : (
        <ul className="check-task-list">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={`check-task-row ${
                selectedTaskId === task.id ? "is-selected" : ""
              } ${task.isActive ? "" : "is-inactive"}`}
            >
              <button
                type="button"
                className="check-task-main"
                onClick={() => setSelectedTaskId(task.id)}
                disabled={busy}
              >
                <span className="check-task-title">{task.title}</span>
                {task.description && (
                  <span className="check-task-desc">{task.description}</span>
                )}
                <span className="check-task-meta">
                  <span className="check-task-count">
                    {task.submittedCount}/{task.totalStudents} 제출
                  </span>
                  {task.dueDate && (
                    <span className="check-task-due">
                      마감 {new Date(task.dueDate).toLocaleDateString("ko-KR")}
                    </span>
                  )}
                  {!task.isActive && (
                    <span className="check-task-status">비활성</span>
                  )}
                </span>
              </button>
              {canManageTasks && (
                <div className="check-task-actions">
                  <button
                    type="button"
                    className="check-task-toggle"
                    onClick={() => handleToggleActive(task)}
                    disabled={busy}
                  >
                    {task.isActive ? "비활성화" : "활성화"}
                  </button>
                  <button
                    type="button"
                    className="check-task-edit"
                    onClick={() => setEditingTask(task)}
                    disabled={busy}
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    className="check-task-delete"
                    onClick={() => handleDelete(task)}
                    disabled={busy}
                  >
                    삭제
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {toast && <p className="check-toast">{toast}</p>}

      {selectedTask && (
        <CheckRoster
          classroomId={classroomId}
          taskId={selectedTask.id}
          taskTitle={selectedTask.title}
          onClose={() => setSelectedTaskId(null)}
          onSaved={refresh}
        />
      )}

      {creating && (
        <CheckTaskEditor
          initial={null}
          onSave={handleSaveDraft}
          onCancel={() => setCreating(false)}
          busy={busy}
        />
      )}

      {editingTask && (
        <CheckTaskEditor
          initial={editingTask}
          onSave={handleSaveDraft}
          onCancel={() => setEditingTask(null)}
          busy={busy}
        />
      )}
    </section>
  );
}

type EditorProps = {
  initial: CheckTask | null;
  onSave: (draft: {
    title: string;
    description?: string;
    dueDate?: string | null;
  }) => void;
  onCancel: () => void;
  busy: boolean;
};

function CheckTaskEditor({ initial, onSave, onCancel, busy }: EditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(
    toDateInputValue(initial?.dueDate ?? null)
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onSave({
      title: t,
      description: description.trim() || undefined,
      dueDate: dateInputToIso(dueDate),
    });
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "체크 편집" : "체크 추가"}
    >
      <form className="check-editor" onSubmit={handleSubmit}>
        <header className="check-editor-header">
          <h3>{initial ? "체크 편집" : "체크 추가"}</h3>
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
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label className="check-editor-field">
          <span>설명 (선택)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
          />
        </label>
        <label className="check-editor-field">
          <span>마감일 (선택)</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <footer className="check-editor-footer">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </footer>
      </form>
    </div>
  );
}

type RosterProps = {
  classroomId: string;
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

function CheckRoster({
  classroomId,
  taskId,
  taskTitle,
  onClose,
  onSaved,
}: RosterProps) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [yelCardBusy, setYelCardBusy] = useState<string | null>(null);
  const [yelCardReasons, setYelCardReasons] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch(
      `/api/classrooms/${classroomId}/checks/${taskId}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error;
      setError(typeof msg === "string" ? msg : "명단을 불러오지 못했어요.");
      setLoaded(true);
      return;
    }
    const data = (await res.json()) as TaskDetailResponse;
    setRoster(data.roster);
    const next: Record<string, boolean> = {};
    for (const entry of data.roster) {
      next[entry.student.id] = entry.submission?.submitted ?? false;
    }
    setDraft(next);
    setLoaded(true);
  }, [classroomId, taskId]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  const submittedCount = useMemo(
    () => Object.values(draft).filter(Boolean).length,
    [draft]
  );

  function toggle(studentId: string) {
    setDraft((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
    setToast(null);
  }

  function markAll(value: boolean) {
    setDraft((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) next[k] = value;
      return next;
    });
    setToast(null);
  }

  async function handleSave() {
    const updates = roster.map((entry) => ({
      studentId: entry.student.id,
      submitted: !!draft[entry.student.id],
    }));
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/checks/${taskId}/submissions`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ updates }),
        }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setError(typeof msg === "string" ? msg : "저장 실패");
        return;
      }
      setToast("저장됨");
      await refresh();
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleYellowCard(studentId: string, studentName: string) {
    const reason = yelCardReasons[studentId]?.trim();
    if (!reason) {
      alert("기록할 이유를 입력해주세요.");
      return;
    }
    if (!window.confirm(`${studentName}님에게 노란브를 부여할까요? (이유: ${reason})`)) return;
    setYelCardBusy(studentId);
    setToast(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/yellow-cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, reason }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setError(typeof msg === "string" ? msg : "노란브 부여 실패");
        return;
      }
      const data = await res.json();
      const msg = data.promotedToCleaningDuty
        ? `✦ ${studentName}님이 오늘의 청소 당번이 되었습니다! (구번째 노란브)`
        : `${studentName}님 노란브 1회 (오늘 ${data.todayCount}회째)`;
      setToast(msg);
      setYelCardReasons((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      await refresh();
    } catch {
      setError("노란브 부여 중 오류가 발생했습니다.");
    } finally {
      setYelCardBusy(null);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${taskTitle} 명단`}
    >
      <div className="check-roster" onClick={(e) => e.stopPropagation()}>
        <header className="check-roster-header">
          <h3>{taskTitle} · 제출 명단</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>

        {!loaded ? (
          <p className="check-roster-loading">불러오는 중…</p>
        ) : error ? (
          <p className="check-roster-error">{error}</p>
        ) : roster.length === 0 ? (
          <p className="check-roster-empty">학생 명단이 없어요.</p>
        ) : (
          <>
            <div className="check-roster-toolbar">
              <span className="check-roster-count">
                {submittedCount}/{roster.length} 제출
              </span>
              <div className="check-roster-bulk">
                <button
                  type="button"
                  onClick={() => markAll(true)}
                  disabled={saving}
                >
                  전체 제출
                </button>
                <button
                  type="button"
                  onClick={() => markAll(false)}
                  disabled={saving}
                >
                  전체 미제출
                </button>
              </div>
            </div>

            <ul className="check-roster-list">
              {roster.map((entry) => {
                const submitted = !!draft[entry.student.id];
                return (
                  <li
                    key={entry.student.id}
                    className={`check-roster-row ${
                      submitted ? "is-submitted" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="check-roster-toggle"
                      onClick={() => toggle(entry.student.id)}
                      disabled={saving}
                      aria-pressed={submitted}
                    >
                      <span className="check-roster-num">
                        {entry.student.number ?? "-"}
                      </span>
                      <span className="check-roster-name">
                        {entry.student.name}
                      </span>
                      <span className="check-roster-mark">
                        {submitted ? "✓ 제출" : "미제출"}
                      </span>
                    </button>
                    {!submitted && (
                      <div className="check-yellow-card-area">
                        <input
                          type="text"
                          className="check-yellow-reason"
                          placeholder="노란브 이유"
                          value={yelCardReasons[entry.student.id] ?? ""}
                          onChange={(e) =>
                            setYelCardReasons((prev) => ({
                              ...prev,
                              [entry.student.id]: e.target.value,
                            }))
                          }
                          maxLength={100}
                          disabled={saving || yelCardBusy !== null}
                        />
                        <button
                          type="button"
                          className="check-yellow-btn"
                          onClick={() => handleYellowCard(entry.student.id, entry.student.name)}
                          disabled={saving || yelCardBusy !== null || !(yelCardReasons[entry.student.id]?.trim())}
                          title="노란브 부여"
                        >
                          {yelCardBusy === entry.student.id ? "..." : "타격"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <footer className="check-roster-footer">
              {toast && <span className="check-roster-toast">{toast}</span>}
              <button
                type="button"
                className="check-roster-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중…" : "변경사항 저장"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
