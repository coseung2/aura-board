"use client";

import { useState } from "react";

type LadderStepKey =
  | "experience"
  | "currentStatus"
  | "reason"
  | "condition"
  | "alternative"
  | "position";

type TemplateButton = {
  label: string;
  template: string;
};

type LadderStep = {
  key: LadderStepKey;
  title: string;
  instruction: string;
  role: string;
  templates: string[];
  exampleQuestion: string;
  choiceExamples?: string[];
  helpButtons: TemplateButton[];
};

const STEPS: LadderStep[] = [
  {
    key: "experience",
    title: "1층. 경험 질문",
    instruction: "사람들이 이 이슈를 직접 겪어본 적이 있는지 묻는 질문을 만듭니다.",
    role: "겪어본 적이 있는지 묻는 질문 1개",
    templates: [
      "_______을/를 경험한 적이 있나요?",
      "_______ 때문에 불편했던 적이 있나요?",
      "_______을/를 본 적이 있나요?",
      "_______와 관련된 일을 겪어본 적이 있나요?",
    ],
    exampleQuestion:
      "가족과 함께 가려던 곳이 노키즈존이라 들어가지 못한 경험이 있나요?",
    helpButtons: [
      { label: "겪어본 적", template: "_______을/를 경험한 적이 있나요?" },
      { label: "불편했던 적", template: "_______ 때문에 불편했던 적이 있나요?" },
      { label: "본 적", template: "_______을/를 본 적이 있나요?" },
      {
        label: "들은 적",
        template: "_______와 관련된 이야기를 들은 적이 있나요?",
      },
    ],
  },
  {
    key: "currentStatus",
    title: "2층. 현황 질문",
    instruction:
      "이 이슈가 우리 주변에 얼마나 있는지, 얼마나 자주 일어나는지 확인할 수 있는 질문을 만듭니다.",
    role: "세거나 확인할 수 있는 질문 1개",
    templates: [
      "우리 주변에는 _______이/가 얼마나 있나요?",
      "_______은/는 일주일에 몇 번 일어나나요?",
      "_______을/를 경험한 사람은 몇 명인가요?",
      "_______ 중 _______에 해당하는 것은 몇 개인가요?",
    ],
    exampleQuestion: "우리 학교 주변 카페 중 노키즈존은 몇 곳인가요?",
    helpButtons: [
      { label: "우리 주변", template: "우리 주변에는 _______이/가 얼마나 있나요?" },
      { label: "몇 번", template: "_______은/는 일주일에 몇 번 일어나나요?" },
      { label: "몇 명", template: "_______을/를 경험한 사람은 몇 명인가요?" },
      { label: "몇 개", template: "_______ 중 _______에 해당하는 것은 몇 개인가요?" },
    ],
  },
  {
    key: "reason",
    title: "3층. 이유 질문",
    instruction:
      "이 일이 왜 생겼는지, 사람들이 그 이유를 어떻게 생각하는지 묻는 질문을 만듭니다.",
    role: "원인이나 이유를 묻는 질문 1개",
    templates: [
      "_______이/가 생기는 가장 큰 이유는 무엇이라고 생각하나요?",
      "사람들이 _______을/를 하는 이유는 무엇일까요?",
      "_______ 문제가 생기는 원인은 무엇이라고 생각하나요?",
      "_______에 영향을 주는 가장 큰 이유는 무엇인가요?",
    ],
    exampleQuestion: "노키즈존이 생기는 가장 큰 이유는 무엇이라고 생각하나요?",
    choiceExamples: [
      "아이들이 시끄럽게 해서",
      "안전사고가 걱정돼서",
      "다른 손님들이 불편해해서",
      "가게 운영이 어려워서",
      "보호자의 관리 부족 때문에",
      "잘 모르겠다",
    ],
    helpButtons: [
      { label: "가장 큰 이유", template: "_______이/가 생기는 가장 큰 이유는 무엇이라고 생각하나요?" },
      { label: "사람들이 하는 이유", template: "사람들이 _______을/를 하는 이유는 무엇일까요?" },
      { label: "문제 원인", template: "_______ 문제가 생기는 원인은 무엇이라고 생각하나요?" },
    ],
  },
  {
    key: "condition",
    title: "4층. 조건 질문",
    instruction:
      "무조건 찬성·반대가 아니라, 어떤 경우에는 괜찮고 어떤 경우에는 문제가 되는지 알아보는 질문을 만듭니다.",
    role: "기준이나 조건을 묻는 질문 1개",
    templates: [
      "어떤 경우라면 _______이/가 괜찮다고 생각하나요?",
      "_______을/를 허용하려면 어떤 조건이 필요할까요?",
      "_______은/는 어느 정도까지 가능하다고 생각하나요?",
      "다음 중 가장 적절한 기준은 무엇이라고 생각하나요?",
    ],
    exampleQuestion:
      "다음 중 가장 적절한 노키즈존 운영 방식은 무엇이라고 생각하나요?",
    choiceExamples: [
      "모든 어린이 출입 제한",
      "미취학 아동만 제한",
      "보호자 동반 시 입장 가능",
      "조용한 시간대만 제한",
      "어린이 이용 가능 좌석 따로 마련",
      "노키즈존은 운영하지 않아야 함",
    ],
    helpButtons: [
      { label: "나이 기준", template: "_______은/는 몇 살부터 가능하다고 생각하나요?" },
      { label: "시간 기준", template: "어떤 시간대라면 _______이/가 괜찮다고 생각하나요?" },
      { label: "장소 기준", template: "어떤 장소에서는 _______이/가 괜찮다고 생각하나요?" },
      { label: "행동 기준", template: "어떤 행동을 지킨다면 _______이/가 괜찮다고 생각하나요?" },
      { label: "보호자 동반", template: "보호자와 함께라면 _______을/를 허용해도 된다고 생각하나요?" },
    ],
  },
  {
    key: "alternative",
    title: "5층. 대안 질문",
    instruction:
      "문제를 줄이거나 더 나은 방법을 찾기 위해 어떤 해결 방법이 필요한지 묻는 질문을 만듭니다.",
    role: "해결 방법이나 대안을 묻는 질문 1개",
    templates: [
      "_______을/를 줄이기 위해 가장 필요한 것은 무엇인가요?",
      "_______ 문제를 해결하려면 무엇이 먼저 바뀌어야 할까요?",
      "_______을/를 더 좋게 만들기 위한 방법은 무엇인가요?",
      "다음 중 가장 도움이 될 방법은 무엇이라고 생각하나요?",
    ],
    exampleQuestion:
      "어린이도 함께 이용할 수 있는 카페를 만들기 위해 가장 필요한 것은 무엇인가요?",
    choiceExamples: [
      "어린이 이용 예절 안내",
      "보호자의 관리 책임 강화",
      "어린이 가능 시간대 운영",
      "어린이 전용 좌석 마련",
      "가게별 명확한 이용 기준 표시",
    ],
    helpButtons: [
      { label: "줄이기", template: "_______을/를 줄이기 위해 가장 필요한 것은 무엇인가요?" },
      { label: "먼저 바꿀 것", template: "_______ 문제를 해결하려면 무엇이 먼저 바뀌어야 할까요?" },
      { label: "더 좋게", template: "_______을/를 더 좋게 만들기 위한 방법은 무엇인가요?" },
      { label: "도움 될 방법", template: "다음 중 가장 도움이 될 방법은 무엇이라고 생각하나요?" },
    ],
  },
  {
    key: "position",
    title: "마지막. 입장 질문",
    instruction:
      "앞에서 만든 경험·현황·이유·조건·대안 질문을 생각한 뒤, 마지막에 사람들의 최종 생각을 묻습니다.",
    role: "최종 생각을 묻는 질문 1개",
    templates: [
      "위 내용을 생각해 보았을 때, _______에 대해 어떻게 생각하나요?",
      "_______에 대한 여러분의 생각은 무엇인가요?",
      "_______에 대해 가장 가까운 생각을 골라 주세요.",
    ],
    exampleQuestion:
      "위 내용을 생각해 보았을 때, 노키즈존에 대해 어떻게 생각하나요?",
    choiceExamples: ["찬성한다", "조건부로 찬성한다", "반대한다", "잘 모르겠다"],
    helpButtons: [
      { label: "위 내용 생각", template: "위 내용을 생각해 보았을 때, _______에 대해 어떻게 생각하나요?" },
      { label: "여러분 생각", template: "_______에 대한 여러분의 생각은 무엇인가요?" },
      { label: "가까운 생각", template: "_______에 대해 가장 가까운 생각을 골라 주세요." },
    ],
  },
];

const CHECKLIST = [
  "경험을 묻는 질문이 있다.",
  "현황을 세거나 확인하는 질문이 있다.",
  "이유를 묻는 질문이 있다.",
  "조건을 묻는 질문이 있다.",
  "대안을 묻는 질문이 있다.",
  "찬성·반대 질문은 마지막에 있다.",
  "질문 결과를 표나 그래프로 나타낼 수 있다.",
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

  const ql = (value.questionLadder as Record<string, unknown>) ?? {};
  const checklist = Array.isArray(ql.checklist) ? (ql.checklist as string[]) : [];

  const text = (key: string) => (typeof ql[key] === "string" ? (ql[key] as string) : "");

  function updateQuestionLadder(next: Record<string, unknown>) {
    onChange({ ...value, questionLadder: { ...ql, ...next } });
  }

  function setQuestion(key: LadderStepKey, nextText: string) {
    updateQuestionLadder({ [key]: nextText });
  }

  function toggleChecklist(item: string) {
    updateQuestionLadder({
      checklist: checklist.includes(item)
        ? checklist.filter((current) => current !== item)
        : [...checklist, item],
    });
  }

  async function requestLlm(index: number, textValue: string) {
    if (!textValue.trim()) return;
    setLoadingLlm(index);
    try {
      const res = await fetch(
        `/api/sections/${sectionId}/missions/${stepNumber}/llm-feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ladderStep: STEPS[index].key, text: textValue }),
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
      <section className="question-ladder-issue">
        <label className="mission-form-label" htmlFor="question-ladder-issue">
          우리 팀 이슈
        </label>
        <input
          id="question-ladder-issue"
          type="text"
          value={text("issue")}
          onChange={(event) => updateQuestionLadder({ issue: event.target.value })}
          disabled={disabled}
          placeholder="예) 노키즈존은 초등학생에게도 적용되어야 할까?"
        />
      </section>

      {STEPS.map((step, index) => {
        const isOpen = openIndex === index;
        const question = text(step.key);
        const feedback = llmFeedback[step.key];

        return (
          <section
            key={step.key}
            className={`question-ladder-step ${isOpen ? "open" : ""}`}
          >
            <button
              type="button"
              className="question-ladder-header"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              aria-expanded={isOpen}
            >
              <span>{step.title}</span>
              <span className="question-ladder-arrow">{isOpen ? "▼" : "▶"}</span>
            </button>
            {isOpen && (
              <div className="question-ladder-body">
                <p className="question-ladder-instruction">{step.instruction}</p>
                <p className="question-ladder-role">
                  이 층에서 만들 질문: <strong>{step.role}</strong>
                </p>

                <div className="question-ladder-example">
                  <span>예시</span>
                  <p>{step.exampleQuestion}</p>
                </div>

                <div className="question-template-list" aria-label={`${step.title} 문장틀`}>
                  {step.templates.map((template) => (
                    <button
                      key={template}
                      type="button"
                      className="question-template-button"
                      onClick={() => setQuestion(step.key, template)}
                      disabled={disabled}
                    >
                      {template}
                    </button>
                  ))}
                </div>

                <div className="question-help-buttons" aria-label={`${step.title} 도움 버튼`}>
                  {step.helpButtons.map((button) => (
                    <button
                      key={button.label}
                      type="button"
                      onClick={() => setQuestion(step.key, button.template)}
                      disabled={disabled}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>

                {step.choiceExamples && (
                  <div className="question-choice-example">
                    <span>선택지 예시</span>
                    <p>{step.choiceExamples.join(" / ")}</p>
                  </div>
                )}

                <label className="question-ladder-input-label" htmlFor={`ladder-${step.key}`}>
                  우리 팀의 {step.title.replace(/^[^ ]+ /, "")}을 써 보세요.
                </label>
                <textarea
                  id={`ladder-${step.key}`}
                  value={question}
                  onChange={(event) => setQuestion(step.key, event.target.value)}
                  disabled={disabled}
                  placeholder="문장틀을 누르거나 직접 질문을 써 보세요."
                  rows={4}
                />
                {!disabled && (
                  <button
                    type="button"
                    className="btn-llm"
                    onClick={() => requestLlm(index, question)}
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
          </section>
        );
      })}

      <section className="question-ladder-checklist">
        <h4>질문 사다리 완성 확인</h4>
        {CHECKLIST.map((item) => (
          <label className="inline-label" key={item}>
            <input
              type="checkbox"
              checked={checklist.includes(item)}
              onChange={() => toggleChecklist(item)}
              disabled={disabled}
            />
            {item}
          </label>
        ))}
      </section>
    </div>
  );
}
