"use client";

import { getClassifiedQuestionTexts } from "../QuestionClassificationBoard";

export function Mission3SurveyBuilder({
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
  const survey = (value.survey as Record<string, unknown>) ?? {};
  const items = (survey.items as Array<Record<string, unknown>>) ?? [];
  const surveyQuestions = getClassifiedQuestionTexts(sourceContent, "survey");

  const updateSurvey = (newItems: Array<Record<string, unknown>>) => {
    onChange({ ...value, survey: { ...survey, items: newItems } });
  };

  const addItem = () => {
    updateSurvey([...items, { question: "", options: ["", ""], isKeyItem: false }]);
  };

  const removeItem = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    updateSurvey(next);
  };

  const updateItem = (index: number, field: string, newValue: unknown) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, [field]: newValue } : item
    );
    updateSurvey(next);
  };

  const importSurveyQuestions = () => {
    updateSurvey([
      ...items,
      ...surveyQuestions.map((question) => ({
        question,
        options: ["", ""],
        isKeyItem: false,
      })),
    ]);
  };

  return (
    <div className="mission-form">
      {surveyQuestions.length > 0 && (
        <section className="mission-form-card">
          <label className="mission-form-label">분류된 설문 질문</label>
          <p className="mission-form-helper">
            미션 3에서 설문으로 묻기로 나눈 질문입니다. 필요한 질문만 문항으로 다듬어
            선택지를 붙이면 됩니다.
          </p>
          <ul className="mission-reference-list">
            {surveyQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          {!disabled && (
            <button
              className="btn-secondary"
              onClick={importSurveyQuestions}
              type="button"
            >
              설문 문항으로 가져오기
            </button>
          )}
        </section>
      )}
      {items.map((item, index) => {
        const options = (item.options as string[]) ?? [];
        return (
          <div key={index} className="form-group survey-item">
            <div className="survey-item-header">
              <strong>문항 {index + 1}</strong>
              {!disabled && (
                <button
                  className="btn-secondary"
                  onClick={() => removeItem(index)}
                  type="button"
                >
                  삭제
                </button>
              )}
            </div>
            <label>질문</label>
            <textarea
              value={(item.question as string) ?? ""}
              onChange={(e) => updateItem(index, "question", e.target.value)}
              disabled={disabled}
              rows={2}
              placeholder="질문을 입력하세요."
            />
            <label className="inline-label">
              <input
                type="checkbox"
                checked={(item.isKeyItem as boolean) ?? false}
                onChange={(e) => updateItem(index, "isKeyItem", e.target.checked)}
                disabled={disabled}
              />
              핵심 문항
            </label>
            <label>선택지 (쉼표로 구분)</label>
            <input
              type="text"
              value={options.join(", ")}
              onChange={(e) =>
                updateItem(
                  index,
                  "options",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                )
              }
              disabled={disabled}
              placeholder="예: 매우 그렇다, 그렇다, 보통이다, 아니다"
            />
          </div>
        );
      })}
      {!disabled && (
        <button className="btn-primary" onClick={addItem} type="button">
          문항 추가
        </button>
      )}
    </div>
  );
}
