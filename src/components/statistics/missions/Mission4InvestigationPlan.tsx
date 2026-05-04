"use client";

import { getClassifiedQuestionTexts } from "../QuestionClassificationBoard";

export function Mission4InvestigationPlan({
  value,
  onChange,
  disabled,
  sourceContent,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
  sourceContent?: unknown;
}) {
  const data = (value.investigationPlan as Record<string, unknown>) ?? {};
  const directQuestions = getClassifiedQuestionTexts(sourceContent, "direct");

  const update = (field: string, newValue: unknown) => {
    onChange({ ...value, investigationPlan: { ...data, [field]: newValue } });
  };

  return (
    <div className="mission-form">
      {directQuestions.length > 0 && (
        <section className="mission-form-card">
          <label className="mission-form-label">직접 조사할 질문</label>
          <p className="mission-form-helper">
            미션 3에서 직접 세거나 관찰하기로 나눈 질문입니다. 이 질문을 기준으로
            조사 대상과 방법을 정하세요.
          </p>
          <ul className="mission-reference-list">
            {directQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          {!disabled && (
            <button
              className="btn-secondary"
              onClick={() => update("directQuestions", directQuestions)}
              type="button"
            >
              조사 계획에 반영
            </button>
          )}
        </section>
      )}
      <div className="form-group">
        <label>조사 대상</label>
        <textarea
          value={(data.target as string) ?? ""}
          onChange={(e) => update("target", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="누구를 조사할 것인가요?"
        />
      </div>
      <div className="form-group">
        <label>목표 응답 수</label>
        <input
          type="number"
          value={(data.goalCount as number) ?? ""}
          onChange={(e) => update("goalCount", Number(e.target.value))}
          disabled={disabled}
          placeholder="예: 50"
        />
      </div>
      <div className="form-group">
        <label>조사 방법</label>
        <textarea
          value={(data.method as string) ?? ""}
          onChange={(e) => update("method", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="어떤 방법으로 조사할 것인가요?"
        />
      </div>
      <div className="form-group">
        <label>조사 기간</label>
        <input
          type="text"
          value={(data.period as string) ?? ""}
          onChange={(e) => update("period", e.target.value)}
          disabled={disabled}
          placeholder="예: 5월 1일 ~ 5월 7일"
        />
      </div>
      <div className="form-group">
        <label>링크 또는 방법</label>
        <textarea
          value={(data.linkOrMethod as string) ?? ""}
          onChange={(e) => update("linkOrMethod", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="구글폼 링크나 구체적인 조사 방법을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>추가 사항</label>
        <textarea
          value={((data.additional as string[]) ?? []).join("\n")}
          onChange={(e) =>
            update(
              "additional",
              e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
            )
          }
          disabled={disabled}
          rows={3}
          placeholder="추가로 필요한 사항을 줄바꿈으로 구분하여 적어주세요."
        />
      </div>
    </div>
  );
}
