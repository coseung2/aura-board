"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchShoeRoster,
  saveShoeFindings,
  type ShoeRosterEntry,
} from "@/lib/inspections-client";

type Props = { classroomId: string };

export function ClassroomShoeInspector({ classroomId }: Props) {
  const [roster, setRoster] = useState<ShoeRosterEntry[]>([]);
  function formatDateNav(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  function prevDay(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  function nextDay(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);

  const refresh = useCallback(async (selectedDate?: string | null) => {
    setError(null);
    try {
      const data = await fetchShoeRoster(classroomId, selectedDate ?? null);
      setRoster(data.roster);
      setDate(data.date);
      const next: Record<string, boolean> = {};
      for (const entry of data.roster) {
        next[entry.student.id] = entry.finding?.notArranged ?? false;
      }
      setDraft(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "명단을 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, [classroomId]);

  useEffect(() => {
    setLoaded(false);
    refresh(date);
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const flaggedCount = useMemo(
    () => Object.values(draft).filter(Boolean).length,
    [draft],
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
    const findings = roster.map((entry) => ({
      studentId: entry.student.id,
      notArranged: !!draft[entry.student.id],
    }));
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      await saveShoeFindings(classroomId, findings, date ?? null);
      setToast("저장되었습니다");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="classroom-check shoe-inspector">
      <header className="check-header">
        <div>
          <h2>실내화 정리 검사</h2>
        </div>
        <div className="check-header-actions">
              <div className="date-nav">
                <button type="button" className="date-nav-btn" onClick={() => setDate(prevDay(date ?? ''))}>‹</button>
                <span className="date-nav-label">{formatDateNav(date ?? '')}</span>
                <button type="button" className="date-nav-btn" onClick={() => setDate(nextDay(date ?? ''))}>›</button>
              </div>
        </div>
      </header>

      {!loaded ? (
        <p className="check-loading">불러오는 중…</p>
      ) : error ? (
        <p className="check-error">{error}</p>
      ) : roster.length === 0 ? (
        <p className="check-empty">검사할 학생 명단이 없습니다.</p>
      ) : (
        <>
          <div className="check-roster-toolbar">
            <span className="check-roster-count">
              정리 안 됨 {flaggedCount}/{roster.length}
            </span>
            <div className="check-roster-bulk">
              <button
                type="button"
                onClick={() => markAll(true)}
                disabled={saving}
              >
                전체 지적
              </button>
              <button
                type="button"
                onClick={() => markAll(false)}
                disabled={saving}
              >
                전체 해제
              </button>
            </div>
          </div>

          <ul className="check-roster-list shoe-roster-list">
            {roster.map((entry) => {
              const flagged = !!draft[entry.student.id];
              return (
                <li
                  key={entry.student.id}
                  className={`check-roster-row ${flagged ? "is-submitted" : ""}`}
                >
                  <button
                    type="button"
                    className="check-roster-toggle"
                    onClick={() => toggle(entry.student.id)}
                    disabled={saving}
                    aria-pressed={flagged}
                  >
                    <span className="check-roster-num">
                      {entry.student.number ?? "-"}
                    </span>
                    <span className="check-roster-name">
                      {entry.student.name}
                    </span>
                    <span className="check-roster-mark">
                      {flagged ? "정리 안 됨" : "정상"}
                    </span>
                  </button>
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
              {saving ? "저장 중…" : "검사 결과 저장"}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}


