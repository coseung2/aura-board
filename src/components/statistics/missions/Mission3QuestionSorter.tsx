"use client";

import {
  QuestionClassificationBoard,
  type ClassifiableQuestion,
  type ClassifiedQuestion,
  type QuestionClassification,
} from "../QuestionClassificationBoard";

const QUESTION_SOURCE: Array<{ id: string; label: string }> = [
  { id: "experience", label: "경험 질문" },
  { id: "currentStatus", label: "현황 질문" },
  { id: "reason", label: "이유 질문" },
  { id: "condition", label: "조건 질문" },
  { id: "alternative", label: "대안 질문" },
  { id: "position", label: "입장 질문" },
];

export function Mission3QuestionSorter({
  value,
  onChange,
  disabled,
  sourceContent,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
  sourceContent: unknown;
}) {
  const data = (value.questionClassification as Record<string, unknown>) ?? {};
  const existingItems = Array.isArray(data.items)
    ? (data.items as ClassifiedQuestion[])
    : [];
  const sourceQuestions = buildSourceQuestions(sourceContent);
  const questions = mergeClassifiedQuestions(sourceQuestions, existingItems);

  function updateItems(items: ClassifiedQuestion[]) {
    onChange({ ...value, questionClassification: { ...data, items } });
  }

  function classify(id: string, category: QuestionClassification) {
    updateItems(
      questions.map((question) =>
        question.id === id ? { ...question, category } : question
      )
    );
  }

  return (
    <div className="mission-form">
      <section className="mission-form-card">
        <label className="mission-form-label">질문을 조사 방법별로 나누세요</label>
        <p className="mission-form-helper">
          설문으로 물어볼 질문과 우리 팀이 직접 세거나 관찰해야 할 질문을 구분해야
          다음 단계에서 문항과 조사 계획이 섞이지 않습니다.
        </p>
        <QuestionClassificationBoard
          questions={questions}
          disabled={disabled}
          onClassify={classify}
        />
      </section>
    </div>
  );
}

function buildSourceQuestions(sourceContent: unknown): ClassifiableQuestion[] {
  const content =
    sourceContent && typeof sourceContent === "object" && !Array.isArray(sourceContent)
      ? (sourceContent as Record<string, unknown>)
      : {};
  const ladder =
    content.questionLadder &&
    typeof content.questionLadder === "object" &&
    !Array.isArray(content.questionLadder)
      ? (content.questionLadder as Record<string, unknown>)
      : {};

  return QUESTION_SOURCE.map((source) => ({
    id: source.id,
    label: source.label,
    question: typeof ladder[source.id] === "string" ? (ladder[source.id] as string) : "",
  }));
}

function mergeClassifiedQuestions(
  sourceQuestions: ClassifiableQuestion[],
  existingItems: ClassifiedQuestion[]
): ClassifiedQuestion[] {
  return sourceQuestions.map((source) => {
    const existing = existingItems.find((item) => item.id === source.id);
    return {
      ...source,
      category: existing?.category ?? null,
    };
  });
}
