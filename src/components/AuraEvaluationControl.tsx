"use client";

import { useEffect, useState } from "react";

// Aura 평가 모드 (2026-06-23): 카드 단위 상/중/하 등급 컨트롤.
// 보드 설정에서 평가모드가 켜지고 과목/단원/평가항목이 모두 있을 때만
// grid/freeform 카드에 렌더된다. 진실은 AiFeedback 이고, 이 컨트롤은
// PUT /api/cards/[id]/aura-evaluation 만 호출한다.

export type AuraEvaluationLevel = "high" | "mid" | "low";

export type AuraBoardSettings = {
  evaluationEnabled: boolean;
  subject: string | null;
  unit: string | null;
  criterion: string | null;
};

const LEVEL_LABELS: Record<AuraEvaluationLevel, string> = {
  high: "상",
  mid: "중",
  low: "하",
};

const LEVEL_ORDER: AuraEvaluationLevel[] = ["high", "mid", "low"];

type Props = {
  cardId: string;
  // 서버에서 내려온 초기 등급. 이후에는 컨트롤이 로컬 상태를 소유한다.
  initialLevel: AuraEvaluationLevel | null;
  onSaved: (level: AuraEvaluationLevel) => void;
};

export function AuraEvaluationControl({
  cardId,
  initialLevel,
  onSaved,
}: Props) {
  const [current, setCurrent] = useState<AuraEvaluationLevel | null>(
    initialLevel,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(initialLevel);
    setError(null);
  }, [cardId, initialLevel]);

  async function select(next: AuraEvaluationLevel) {
    if (busy || next === current) return;
    const prev = current;
    setError(null);
    setCurrent(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/aura-evaluation`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCurrent(prev);
        if (data.error === "student_author_required") {
          setError("카드에 학생 작성자를 먼저 지정해 주세요.");
        } else if (data.error === "evaluation_not_configured") {
          setError("보드 아우라 평가 설정이 필요해요.");
        } else {
          setError("평가 저장에 실패했어요.");
        }
        return;
      }
      onSaved(next);
    } catch {
      setCurrent(prev);
      setError("평가 저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="aura-eval-control"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      role="group"
      aria-label="아우라 평가"
    >
      <div className="aura-eval-segmented">
        {LEVEL_ORDER.map((lvl) => (
          <button
            key={lvl}
            type="button"
            className={`aura-eval-btn ${current === lvl ? "is-selected" : ""}`}
            aria-pressed={current === lvl}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              void select(lvl);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {LEVEL_LABELS[lvl]}
          </button>
        ))}
      </div>
      {error && (
        <p className="aura-eval-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
