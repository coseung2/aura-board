"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { GroupEditorDraft } from "./GroupRosterEditor";
import styles from "./SeatingLayoutLibrary.module.css";

/**
 * Saved seating layout library (2026-07-27). Lets a teacher keep several named
 * arrangements, restore one into the editor, or delete it. Restoring only fills
 * the editor; the classroom's active grouping still changes on 저장.
 */

export type SeatingLayout = {
  id: string;
  name: string;
  groups: GroupEditorDraft[];
  updatedAt: string;
};

type Props = {
  classroomId: string;
  /** Current editor state, saved as a new named layout. */
  currentGroups: GroupEditorDraft[];
  onRestore: (groups: GroupEditorDraft[]) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}

function countStudents(groups: GroupEditorDraft[]): number {
  return groups.reduce((sum, group) => sum + group.studentIds.length, 0);
}

export function SeatingLayoutLibrary({
  classroomId,
  currentGroups,
  onRestore,
  onBusyChange,
  disabled = false,
}: Props) {
  const [layouts, setLayouts] = useState<SeatingLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async (): Promise<boolean> => {
    const requestGeneration = ++refreshGeneration.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/seating-layouts`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (requestGeneration !== refreshGeneration.current) return true;
        setError("저장된 자리 배치를 불러오지 못했어요.");
        setCanRetry(true);
        return false;
      }
      const data = (await res.json()) as { layouts?: SeatingLayout[] };
      if (requestGeneration !== refreshGeneration.current) return true;
      setLayouts(data.layouts ?? []);
      setError(null);
      setCanRetry(false);
      return true;
    } catch {
      if (requestGeneration !== refreshGeneration.current) return true;
      setError("저장된 자리 배치를 불러오지 못했어요.");
      setCanRetry(true);
      return false;
    } finally {
      if (requestGeneration === refreshGeneration.current) {
        setLoading(false);
      }
    }
  }, [classroomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function setOperationBusy(value: boolean) {
    setBusy(value);
    onBusyChange?.(value);
  }

  function errorMessage(errorCode: string | undefined, fallback: string) {
    switch (errorCode) {
      case "name_conflict":
        return "같은 이름의 배치가 이미 있어요. 다른 이름을 입력해 주세요.";
      default:
        return fallback;
    }
  }

  async function saveCurrent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy || disabled) return;
    setOperationBusy(true);
    setError(null);
    setCanRetry(false);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/seating-layouts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, groups: currentGroups }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setCanRetry(false);
        setError(errorMessage(body?.error, "자리 배치를 보관하지 못했어요."));
        return;
      }
      setName("");
      const refreshed = await refresh();
      if (!refreshed) {
        setError("목록을 새로 고치지 못했어요. 다시 시도해 주세요.");
      }
    } catch {
      setError("자리 배치를 보관하지 못했어요.");
    } finally {
      setOperationBusy(false);
    }
  }

  function beginRename(layout: SeatingLayout) {
    if (busy || disabled) return;
    setEditingId(layout.id);
    setEditingName(layout.name);
    setError(null);
    setCanRetry(false);
  }

  function cancelRename() {
    if (busy) return;
    setEditingId(null);
    setEditingName("");
  }

  async function renameLayout(
    event: FormEvent<HTMLFormElement>,
    layout: SeatingLayout,
  ) {
    event.preventDefault();
    const trimmed = editingName.trim();
    if (!trimmed || busy || disabled) return;
    setOperationBusy(true);
    setError(null);
    setCanRetry(false);
    try {
      const res = await fetch(
        `/api/classroom/${classroomId}/seating-layouts/${layout.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setCanRetry(false);
        setError(errorMessage(body?.error, "배치 이름을 바꾸지 못했어요."));
        return;
      }
      setEditingId(null);
      setEditingName("");
      const refreshed = await refresh();
      if (!refreshed) {
        setError("목록을 새로 고치지 못했어요. 다시 시도해 주세요.");
      }
    } catch {
      setError("배치 이름을 바꾸지 못했어요.");
    } finally {
      setOperationBusy(false);
    }
  }

  async function removeLayout(layout: SeatingLayout) {
    if (busy || disabled) return;
    if (!window.confirm(`저장된 자리 배치 "${layout.name}"을 삭제할까요?`)) {
      return;
    }
    setOperationBusy(true);
    setError(null);
    setCanRetry(false);
    try {
      const res = await fetch(
        `/api/classroom/${classroomId}/seating-layouts/${layout.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setCanRetry(false);
        setError(errorMessage(body?.error, "자리 배치를 삭제하지 못했어요."));
        return;
      }
      const refreshed = await refresh();
      if (!refreshed) {
        setError("목록을 새로 고치지 못했어요. 다시 시도해 주세요.");
      }
    } catch {
      setError("자리 배치를 삭제하지 못했어요.");
    } finally {
      setOperationBusy(false);
    }
  }

  return (
    <section className={styles.library} aria-labelledby="seating-library-title">
      <div className={styles.header}>
        <h3 id="seating-library-title" className={styles.title}>
          보관한 배치
        </h3>
        <form className={styles.saveForm} onSubmit={saveCurrent}>
          <label
            className={styles.visuallyHidden}
            htmlFor="seating-layout-name"
          >
            자리 배치 이름
          </label>
          <input
            id="seating-layout-name"
            className={styles.input}
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="예: 1학기 2차"
            maxLength={60}
            autoComplete="off"
            disabled={busy || disabled}
          />
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || disabled || name.trim().length === 0}
          >
            {busy ? "처리 중..." : "배치 보관"}
          </button>
        </form>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className={styles.empty} role="status" aria-live="polite">
          불러오는 중...
        </p>
      ) : layouts.length === 0 && !error ? (
        <p className={styles.empty}>아직 보관한 배치가 없어요.</p>
      ) : layouts.length > 0 ? (
        <ul className={styles.list}>
          {layouts.map((layout) => (
            <li key={layout.id} className={styles.item}>
              {editingId === layout.id ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(event) => void renameLayout(event, layout)}
                >
                  <label
                    className={styles.visuallyHidden}
                    htmlFor={`seating-layout-name-${layout.id}`}
                  >
                    배치 이름
                  </label>
                  <input
                    id={`seating-layout-name-${layout.id}`}
                    className={styles.input}
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    maxLength={60}
                    autoComplete="off"
                    disabled={busy || disabled}
                  />
                  <button
                    type="submit"
                    className={styles.rowButton}
                    disabled={
                      busy || disabled || editingName.trim().length === 0
                    }
                  >
                    {busy ? "처리 중..." : "저장"}
                  </button>
                  <button
                    type="button"
                    className={styles.rowButton}
                    onClick={cancelRename}
                    disabled={busy || disabled}
                  >
                    취소
                  </button>
                </form>
              ) : (
                <>
                  <div className={styles.itemMain}>
                    <strong>{layout.name}</strong>
                    <span>
                      {layout.groups.length}모둠 ·{" "}
                      {countStudents(layout.groups)}명
                      {formatUpdatedAt(layout.updatedAt)
                        ? ` · ${formatUpdatedAt(layout.updatedAt)}`
                        : ""}
                    </span>
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => onRestore(layout.groups)}
                      disabled={busy || disabled}
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => beginRename(layout)}
                      disabled={busy || disabled}
                    >
                      이름 변경
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowButton} ${styles.deleteButton}`}
                      onClick={() => void removeLayout(layout)}
                      disabled={busy || disabled}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {error && canRetry && !loading ? (
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => void refresh()}
          disabled={busy || disabled}
        >
          다시 불러오기
        </button>
      ) : null}
    </section>
  );
}
