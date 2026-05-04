"use client";

export type QuestionClassification = "survey" | "direct" | "revise";

export type ClassifiableQuestion = {
  id: string;
  label: string;
  question: string;
};

export type ClassifiedQuestion = ClassifiableQuestion & {
  category: QuestionClassification | null;
};

export function getClassifiedQuestionTexts(
  sourceContent: unknown,
  category: "survey" | "direct"
): string[] {
  const content =
    sourceContent && typeof sourceContent === "object" && !Array.isArray(sourceContent)
      ? (sourceContent as Record<string, unknown>)
      : {};
  const classification =
    content.questionClassification &&
    typeof content.questionClassification === "object" &&
    !Array.isArray(content.questionClassification)
      ? (content.questionClassification as Record<string, unknown>)
      : {};
  const items = Array.isArray(classification.items)
    ? (classification.items as Array<Record<string, unknown>>)
    : [];

  return items
    .filter((item) => item.category === category)
    .map((item) => (typeof item.question === "string" ? item.question.trim() : ""))
    .filter(Boolean);
}

const CATEGORY_LABELS: Record<QuestionClassification, string> = {
  survey: "설문으로 묻기",
  direct: "직접 조사하기",
  revise: "다시 고치기",
};

const CATEGORY_HELP: Record<QuestionClassification, string> = {
  survey: "경험, 생각, 이유, 조건, 입장은 친구들에게 물어볼 수 있어요.",
  direct: "개수, 위치, 빈도처럼 직접 세거나 관찰할 내용이에요.",
  revise: "너무 넓거나 바로 찬반으로 가는 질문은 다시 다듬어요.",
};

type Props = {
  questions: ClassifiedQuestion[];
  disabled: boolean;
  onClassify: (id: string, category: QuestionClassification) => void;
};

export function QuestionClassificationBoard({
  questions,
  disabled,
  onClassify,
}: Props) {
  const filledQuestions = questions.filter((item) => item.question.trim().length > 0);

  if (filledQuestions.length === 0) {
    return (
      <p className="question-classification-empty">
        먼저 미션 2에서 질문 사다리를 완성해 주세요.
      </p>
    );
  }

  return (
    <div className="question-classification-board">
      <div className="question-classification-source">
        {filledQuestions.map((item) => (
          <article className="question-classification-item" key={item.id}>
            <div>
              <span>{item.label}</span>
              <p>{item.question}</p>
            </div>
            <div className="question-classification-actions">
              {(Object.keys(CATEGORY_LABELS) as QuestionClassification[]).map(
                (category) => (
                  <button
                    key={category}
                    type="button"
                    className={
                      item.category === category ? "is-selected" : undefined
                    }
                    onClick={() => onClassify(item.id, category)}
                    disabled={disabled}
                    title={CATEGORY_HELP[category]}
                  >
                    {CATEGORY_LABELS[category]}
                  </button>
                )
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="question-classification-lanes">
        {(Object.keys(CATEGORY_LABELS) as QuestionClassification[]).map(
          (category) => {
            const laneItems = filledQuestions.filter(
              (item) => item.category === category
            );
            return (
              <section className="question-classification-lane" key={category}>
                <h4>{CATEGORY_LABELS[category]}</h4>
                <p>{CATEGORY_HELP[category]}</p>
                {laneItems.length === 0 ? (
                  <span className="question-classification-placeholder">
                    아직 분류된 질문이 없습니다.
                  </span>
                ) : (
                  laneItems.map((item) => (
                    <span className="question-classification-chip" key={item.id}>
                      {item.question}
                    </span>
                  ))
                )}
              </section>
            );
          }
        )}
      </div>
    </div>
  );
}
