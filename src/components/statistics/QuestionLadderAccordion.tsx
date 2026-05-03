"use client";

import { useState } from "react";

const STEPS = [
  { key: "experience", title: "1층. 경험 질문", hint: "실제로 겪어본 적이 있나요?" },
  { key: "currentStatus", title: "2층. 현황 질문", hint: "우리 주변에는 얼마나 있나요?" },
  { key: "reason", title: "3층. 이유 질문", hint: "왜 이런 일이 생겼을까요?" },
  { key: "condition", title: "4층. 조건 질문", hint: "어떤 경우에는 괜찮고, 어떤 경우에는 문제가 될까요?" },
  { key: "alternative", title: "5층. 대안 질문", hint: "어떻게 바꾸면 더 나아질까요?" },
  { key: "position", title: "마지막. 입장 질문", hint: "그래서 사람들은 어떻게 생각할까요?" },
];

export function QuestionLadderAccordion({
  value,
  onChange,
  disabled,
  sectionId,
  stepNumber,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
  sectionId: string;
  stepNumber: number;
}) {
  const [openIndex, setOpenIndex] = useState<number>(0);
  const [loadingLlm, setLoadingLlm] = useState<number | null>(null);
  const [llmFeedback, setLlmFeedback] = useState<Record<string, string>>({});

  const ql = (value.questionLadder as Record<string, string>) ?? {};

  async function requestLlm(index: number, text: string) {
    if (!text.trim()) return;
    setLoadingLlm(index);
    try {
      const res = await fetch(
        `/api/sections/${sectionId}/missions/${stepNumber}/llm-feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ladderStep: STEPS[index].key, text }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setLlmFeedback((prev) => ({ ...prev, [STEPS[index].key]: data.feedback }));
      }
    } catch {
      setLlmFeedback((prev) => ({
        ...prev,
        [STEPS[index].key]: "조언을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      }));
    } finally {
      setLoadingLlm(null);
    }
  }

  return (
    <div className="question-ladder">
      {STEPS.map((step, index) => {
        const isOpen = openIndex === index;
        const text = ql[step.key] ?? "";
        const feedback = llmFeedback[step.key];
        return (
          <div key={step.key} className={`question-ladder-step ${isOpen ? "open" : ""}`}>
            <button
              className="question-ladder-header"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              aria-expanded={isOpen}
            >
              <span>{step.title}</span>
              <span className="question-ladder-arrow">{isOpen ? "▼" : "▶"}</span>
            </button>
            {isOpen && (
              <div className="question-ladder-body">
                <textarea
                  value={text}
                  onChange={(e) => {
                    onChange({
                      ...value,
                      questionLadder: { ...ql, [step.key]: e.target.value },
                    });
                  }}
                  disabled={disabled}
                  placeholder={step.hint}
                  rows={4}
                />
                <div className="question-ladder-hint">💡 예시: {step.hint}</div>
                {!disabled && (
                  <button
                    className="btn-llm"
                    onClick={() => requestLlm(index, text)}
                    disabled={loadingLlm === index}
                  >
                    {loadingLlm === index ? "AI가 생각 중..." : "AI 조언 받기"}
                  </button>
                )}
                {feedback && (
                  <div className="llm-feedback-bubble" role="status" aria-live="polite">
                    {feedback}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
