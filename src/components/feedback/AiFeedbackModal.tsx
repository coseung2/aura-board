"use client";

import { useEffect, useMemo, useState } from "react";

type RosterStudent = { id: string; name: string; number: number | null };

type Props = {
  /** 사전 체크할 학생 1명 (assignment 채점 패널 등 단일 진입점). */
  studentId?: string | null;
  studentName?: string | null;
  studentNumber?: number | null;
  /** 학급 학생 명단. 다중 선택 + 일괄 생성 UI 의 소스. */
  roster?: RosterStudent[];
  /** 'art' v1 고정. */
  subject?: string;
  /** 칼럼에서 진입했을 때 해당 sectionId - 서버가 그 칼럼 안 학생 카드 이미지를
   *  Gemini Vision 으로 함께 보낸다. assignment 채점 등 다른 진입점은 omit. */
  sectionId?: string | null;
  onClose: () => void;
};

type VisionStatus =
  | { used: true }
  | { used: false; reason: "non_gemini" | "no_card" | "no_image_url" | "fetch_failed" };

type BatchResult =
  | { studentId: string; ok: true; comment: string; model: string; vision: VisionStatus }
  | { studentId: string; ok: false; error: string; vision: VisionStatus };

function visionBadge(v: VisionStatus): { icon: string; title: string } {
  if (v.used) return { icon: "🖼", title: "작품 이미지로 비전 평가" };
  switch (v.reason) {
    case "non_gemini":
      return { icon: "📝", title: "텍스트 전용 (현재 LLM 키가 Gemini 가 아님)" };
    case "no_card":
      return { icon: "📝", title: "텍스트 전용 (이 학생이 작성한 카드가 없음)" };
    case "no_image_url":
      return { icon: "📝", title: "텍스트 전용 (학생 카드에 이미지 첨부가 없음)" };
    case "fetch_failed":
      return { icon: "📝", title: "텍스트 전용 (이미지 fetch 실패 - 5초 timeout)" };
  }
}

/**
 * AI 평어 일괄 생성 모달.
 *
 * 흐름:
 *   1. 학생 다중 선택 (전체 선택 토글 포함). preset 학생이 있으면 자동 체크.
 *   2. 단원 / 평가항목 입력 - 둘 다 선택. 비어있으면 "학기 전반" 톤으로 생성.
 *   3. "✨ N명 평어 생성·전송" 한 번 → 서버에서 동시 4 cap 으로 LLM 호출 + UPSERT.
 *   4. 결과 카드 - 학생별 평어 본문 + 실패 사유.
 */
export function AiFeedbackModal({
  studentId: presetStudentId,
  studentName: presetStudentName,
  studentNumber: presetStudentNumber,
  roster,
  subject = "art",
  sectionId,
  onClose,
}: Props) {
  // preset 학생이 있는데 roster 가 없으면 즉석 1인 roster 로 변환.
  const effectiveRoster: RosterStudent[] = useMemo(() => {
    if (roster && roster.length > 0) return roster;
    if (presetStudentId && presetStudentName) {
      return [
        {
          id: presetStudentId,
          name: presetStudentName,
          number: presetStudentNumber ?? null,
        },
      ];
    }
    return [];
  }, [roster, presetStudentId, presetStudentName, presetStudentNumber]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(presetStudentId ? [presetStudentId] : [])
  );
  const [unit, setUnit] = useState("");
  const [criterion, setCriterion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [visionUsed, setVisionUsed] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const allSelected =
    effectiveRoster.length > 0 && selected.size === effectiveRoster.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(effectiveRoster.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function explainError(e: string): string {
    if (e === "ai_key_missing")
      return "교사 LLM API Key 가 등록돼 있지 않아요. /teacher/settings 에서 등록 후 다시 시도하세요.";
    if (e === "ai_key_decrypt_failed")
      return "LLM Key 복호화에 실패했어요. /teacher/settings 에서 키를 다시 저장해주세요.";
    if (e === "not_classroom_owner_or_missing")
      return "권한이 없거나 학생이 존재하지 않아요";
    if (e === "empty_text") return "LLM 이 빈 응답을 돌려줬어요";
    return e;
  }

  async function handleGenerate() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/ai-feedback/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentIds: Array.from(selected),
          subject,
          unit: unit.trim(),
          criterion: criterion.trim(),
          ...(sectionId ? { sectionId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        results?: BatchResult[];
        visionUsed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(explainError(data.error ?? `http ${res.status}`));
        return;
      }
      setResults(data.results ?? []);
      setVisionUsed(!!data.visionUsed);
    } finally {
      setBusy(false);
    }
  }

  const studentById = useMemo(
    () => new Map(effectiveRoster.map((s) => [s.id, s])),
    [effectiveRoster]
  );

  const successCount = results?.filter((r) => r.ok).length ?? 0;
  const failureCount = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="AI 평어 일괄 생성"
    >
      <div className="ai-feedback-modal ai-feedback-modal--batch">
        <header className="ai-feedback-modal__header">
          <h3>
            ✨ AI 평어 일괄 생성{" "}
            <span className="ai-feedback-modal__subject">[{subject}]</span>
          </h3>
          <span className="ai-feedback-modal__student">
            {selected.size === 0
              ? "학생 미선택"
              : `${selected.size}명 선택`}
          </span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div className="ai-feedback-modal__body">
          {/* 1. 학생 다중 선택 */}
          <section className="ai-feedback-modal__roster">
            <header className="ai-feedback-modal__roster-head">
              <label className="ai-feedback-modal__roster-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  disabled={busy || effectiveRoster.length === 0}
                />
                <span>
                  전체 선택{" "}
                  <small>
                    ({selected.size}/{effectiveRoster.length})
                  </small>
                </span>
              </label>
            </header>
            {effectiveRoster.length === 0 ? (
              <p className="ai-feedback-modal__empty">
                학급 학생 명단을 불러올 수 없어요.
              </p>
            ) : (
              <ul className="ai-feedback-modal__roster-list">
                {effectiveRoster.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <li key={s.id}>
                      <label
                        className={`ai-feedback-modal__roster-row ${
                          checked ? "is-selected" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(s.id)}
                          disabled={busy}
                        />
                        <span className="ai-feedback-modal__roster-num">
                          {s.number ?? "-"}
                        </span>
                        <span className="ai-feedback-modal__roster-name">
                          {s.name}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 2. 단원 / 평가항목 (선택) */}
          <section className="ai-feedback-modal__criteria">
            <label className="ai-feedback-modal__field">
              <span>
                단원 <small>(선택)</small>
              </span>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="예: 상상의 세계 그리기"
                maxLength={120}
                disabled={busy}
              />
            </label>
            <label className="ai-feedback-modal__field">
              <span>
                평가항목 <small>(선택)</small>
              </span>
              <input
                type="text"
                value={criterion}
                onChange={(e) => setCriterion(e.target.value)}
                placeholder="예: 색채 표현하기"
                maxLength={120}
                disabled={busy}
              />
            </label>
            <p className="ai-feedback-modal__hint">
              비워두면 학기 전반의 학습 모습으로 평어가 생성됩니다.
            </p>
          </section>

          {/* 3. 결과 - 생성 후에만 노출 */}
          {results && (
            <section className="ai-feedback-modal__results">
              <header className="ai-feedback-modal__results-head">
                생성 결과 - 성공 {successCount}명
                {failureCount > 0 && ` · 실패 ${failureCount}명`}
                <span className="ai-feedback-modal__results-saved">
                  (저장 완료, Aura 풀 즉시 반영{visionUsed && sectionId ? " · 비전 사용" : ""})
                </span>
              </header>
              <ul className="ai-feedback-modal__results-list">
                {results.map((r) => {
                  const s = studentById.get(r.studentId);
                  const label = s
                    ? `${s.number ? `${s.number}번 ` : ""}${s.name}`
                    : r.studentId;
                  const badge = visionBadge(r.vision);
                  return (
                    <li
                      key={r.studentId}
                      className={
                        r.ok
                          ? "ai-feedback-modal__result-row"
                          : "ai-feedback-modal__result-row is-failed"
                      }
                    >
                      <span className="ai-feedback-modal__result-name">
                        {r.ok ? "✓" : "✗"}{" "}
                        <span
                          className="ai-feedback-modal__result-vision"
                          title={badge.title}
                          aria-label={badge.title}
                        >
                          {badge.icon}
                        </span>{" "}
                        {label}
                      </span>
                      <span className="ai-feedback-modal__result-text">
                        {r.ok ? r.comment : explainError(r.error)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {error && <p className="ai-feedback-modal__error">{error}</p>}
        </div>

        <footer className="ai-feedback-modal__footer">
          <button
            type="button"
            className="ai-feedback-modal__btn ai-feedback-modal__btn--ghost"
            onClick={onClose}
            disabled={busy}
          >
            닫기
          </button>
          <button
            type="button"
            className="ai-feedback-modal__btn ai-feedback-modal__btn--primary"
            onClick={handleGenerate}
            disabled={busy || selected.size === 0}
          >
            {busy
              ? `${selected.size}명 생성 중…`
              : `✨ ${selected.size || ""}명 평어 생성·전송`}
          </button>
        </footer>
      </div>
    </div>
  );
}
