"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCleaningRoster,
  saveCleaningFindings,
  uploadInspectionEvidence,
  type CleaningRosterEntry,
} from "@/lib/inspections-client";

type Props = { classroomId: string };

type Draft = {
  dirty: boolean;
  photoUrl: string | null;
  note: string;
  uploading: boolean;
  // client-only local preview while uploading
  dirtyPhotoUrl: string | null;
};

function emptyDraft(): Draft {
  return { dirty: false, photoUrl: null, note: "", uploading: false, dirtyPhotoUrl: null };
}

export function ClassroomCleaningInspector({ classroomId }: Props) {
  const [roster, setRoster] = useState<CleaningRosterEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchCleaningRoster(classroomId);
      setRoster(data.roster);
      setDate(data.date);
      const next: Record<string, Draft> = {};
      for (const entry of data.roster) {
        const f = entry.finding;
        next[entry.student.id] = {
          dirty: f?.dirty ?? false,
          photoUrl: f?.photoUrl ?? null,
          note: f?.note ?? "",
          uploading: false,
          dirtyPhotoUrl: null,
        };
      }
      setDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "명단을 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, [classroomId]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  const dirtyCount = useMemo(
    () => Object.values(drafts).filter((d) => d.dirty).length,
    [drafts],
  );

  function toggleDirty(studentId: string) {
    setDrafts((prev) => {
      const cur = prev[studentId] ?? emptyDraft();
      return {
        ...prev,
        [studentId]: { ...cur, dirty: !cur.dirty },
      };
    });
    setToast(null);
  }

  function setNote(studentId: string, note: string) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? emptyDraft()), note },
    }));
    setToast(null);
  }

  async function handlePhoto(studentId: string, file: File | null) {
    if (!file) return;
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? emptyDraft()),
        uploading: true,
        dirty: true,
        dirtyPhotoUrl: URL.createObjectURL(file),
      },
    }));
    setToast(null);
    try {
      const { url } = await uploadInspectionEvidence(classroomId, file);
      setDrafts((prev) => ({
        ...prev,
        [studentId]: {
          ...(prev[studentId] ?? emptyDraft()),
          uploading: false,
          photoUrl: url,
          dirtyPhotoUrl: null,
        },
      }));
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [studentId]: {
          ...(prev[studentId] ?? emptyDraft()),
          uploading: false,
          dirtyPhotoUrl: null,
        },
      }));
      setError(e instanceof Error ? e.message : "사진 업로드 실패");
    }
  }

  function removePhoto(studentId: string) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? emptyDraft()),
        photoUrl: null,
        dirtyPhotoUrl: null,
      },
    }));
  }

  async function handleSave() {
    const findings = roster.map((entry) => {
      const d = drafts[entry.student.id] ?? emptyDraft();
      return {
        studentId: entry.student.id,
        dirty: d.dirty,
        note: d.note.trim() || null,
        photoUrl: d.dirty ? d.photoUrl : null,
      };
    });
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      await saveCleaningFindings(classroomId, findings);
      setToast("저장되었습니다");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const anyUploading = Object.values(drafts).some((d) => d.uploading);

  return (
    <section className="classroom-check cleaning-inspector">
      <header className="check-header">
        <div>
          <h2>청소 검사</h2>
          {date && (
            <p className="cleaning-inspector-date">
              {new Date(date).toLocaleDateString("ko-KR")} 기준
            </p>
          )}
        </div>
      </header>

      {!loaded ? (
        <p className="check-loading">불러오는 중…</p>
      ) : error ? (
        <p className="check-error">{error}</p>
      ) : roster.length === 0 ? (
        <p className="check-empty">검사할 학생 명단이 없습니다.</p>
      ) : (
        <ul className="cleaning-roster-list">
          {roster.map((entry) => {
            const d = drafts[entry.student.id] ?? emptyDraft();
            const preview = d.dirtyPhotoUrl ?? d.photoUrl;
            return (
              <li
                key={entry.student.id}
                className={`cleaning-roster-row ${d.dirty ? "is-dirty" : ""}`}
              >
                <button
                  type="button"
                  className="cleaning-roster-head"
                  onClick={() => toggleDirty(entry.student.id)}
                  disabled={saving || d.uploading}
                  aria-pressed={d.dirty}
                >
                  <span className="check-roster-num">
                    {entry.student.number ?? "-"}
                  </span>
                  <span className="check-roster-name">
                    {entry.student.name}
                  </span>
                  {entry.seatLabel && (
                    <span className="cleaning-roster-seat">
                      자리 {entry.seatLabel}
                    </span>
                  )}
                  <span className="cleaning-roster-mark">
                    {d.dirty ? "지적" : "청결"}
                  </span>
                </button>

                {d.dirty && (
                  <div className="cleaning-roster-evidence">
                    <label className="cleaning-photo-pick">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={d.uploading || saving}
                        onChange={(e) =>
                          handlePhoto(entry.student.id, e.target.files?.[0] ?? null)
                        }
                      />
                      <span>{d.uploading ? "업로드 중…" : "사진 첨부"}</span>
                    </label>
                    {preview && (
                      <div className="cleaning-photo-preview">
                        <img src={preview} alt={`${entry.student.name} 자리 사진`} />
                        {!d.uploading && (
                          <button
                            type="button"
                            className="cleaning-photo-remove"
                            onClick={() => removePhoto(entry.student.id)}
                            disabled={saving}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}
                    <input
                      type="text"
                      className="cleaning-note-input"
                      placeholder="비고 (예: 책상 밑 휴지)"
                      value={d.note}
                      onChange={(e) => setNote(entry.student.id, e.target.value)}
                      maxLength={120}
                      disabled={d.uploading || saving}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {toast && <p className="check-toast">{toast}</p>}

      {roster.length > 0 && (
        <footer className="cleaning-inspector-footer">
          <span className="check-roster-count">
            지적 {dirtyCount}/{roster.length}
          </span>
          <button
            type="button"
            className="check-roster-save"
            onClick={handleSave}
            disabled={saving || anyUploading}
          >
            {saving ? "저장 중…" : "검사 결과 저장"}
          </button>
        </footer>
      )}
    </section>
  );
}
