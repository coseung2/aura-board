"use client";

import { useCallback, useEffect, useState } from "react";
import type { GroupEditorDraft } from "./GroupRosterEditor";

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
  disabled = false,
}: Props) {
  const [layouts, setLayouts] = useState<SeatingLayout[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/classroom/${classroomId}/seating-layouts`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError("저장된 자리 배치를 불러오지 못했어요.");
        return;
      }
      const data = (await res.json()) as { layouts?: SeatingLayout[] };
      setLayouts(data.layouts ?? []);
      setError(null);
    } catch {
      setError("저장된 자리 배치를 불러오지 못했어요.");
    } finally {
      setLoaded(true);
    }
  }, [classroomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveCurrent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    setError(null);
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
        setError(body?.error ?? "자리 배치를 저장하지 못했어요.");
        return;
      }
      setName("");
      await refresh();
    } catch {
      setError("자리 배치를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLayout(layout: SeatingLayout) {
    if (busy || disabled) return;
    if (!window.confirm(`저장된 자리 배치 "${layout.name}"을 삭제할까요?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/classroom/${classroomId}/seating-layouts/${layout.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("자리 배치를 삭제하지 못했어요.");
        return;
      }
      await refresh();
    } catch {
      setError("자리 배치를 삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="seating-library" aria-labelledby="seating-library-title">
      <div className="seating-library-head">
        <h3 id="seating-library-title" className="seating-library-title">
          저장된 자리 배치
        </h3>
        <form className="seating-library-save" onSubmit={saveCurrent}>
          <label className="sr-only" htmlFor="seating-layout-name">
            자리 배치 이름
          </label>
          <input
            id="seating-layout-name"
            className="seating-library-input"
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
            className="classroom-action-btn"
            disabled={busy || disabled || name.trim().length === 0}
          >
            현재 배치 저장
          </button>
        </form>
      </div>

      {error ? (
        <p className="classroom-roles-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded ? null : layouts.length === 0 ? (
        <p className="seating-library-empty">
          저장된 자리 배치가 없어요. 이름을 적고 현재 배치를 저장해 보세요.
        </p>
      ) : (
        <ul className="seating-library-list">
          {layouts.map((layout) => (
            <li key={layout.id} className="seating-library-item">
              <div className="seating-library-item-main">
                <strong>{layout.name}</strong>
                <span>
                  {layout.groups.length}분단 · {countStudents(layout.groups)}명
                  {formatUpdatedAt(layout.updatedAt)
                    ? ` · ${formatUpdatedAt(layout.updatedAt)}`
                    : ""}
                </span>
              </div>
              <div className="seating-library-item-actions">
                <button
                  type="button"
                  className="classroom-row-btn"
                  onClick={() => onRestore(layout.groups)}
                  disabled={busy || disabled}
                >
                  불러오기
                </button>
                <button
                  type="button"
                  className="classroom-row-btn classroom-row-btn-delete"
                  onClick={() => void removeLayout(layout)}
                  disabled={busy || disabled}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
