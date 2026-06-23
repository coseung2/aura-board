export const AURA_EVALUATION_MODEL = "aura-board:evaluation-mode:v1";

export type AuraEvaluationLevel = "high" | "mid" | "low";

export const AURA_EVALUATION_LEVELS: readonly AuraEvaluationLevel[] = [
  "high",
  "mid",
  "low",
] as const;

const LEVEL_COMMENTS: Record<AuraEvaluationLevel, string> = {
  high: "선정한 내용을 글의 구조에 맞게 충실히 정리하여 설명하는 글쓰기가 잘 드러남.",
  mid: "설명할 내용을 대체로 정리했으며 글의 구조를 갖추려는 모습이 보임.",
  low: "설명할 내용 선정과 글의 구조 정리가 더 필요함.",
};

export function isAuraEvaluationLevel(value: unknown): value is AuraEvaluationLevel {
  return (
    typeof value === "string" &&
    (AURA_EVALUATION_LEVELS as readonly string[]).includes(value)
  );
}

export function commentForLevel(level: AuraEvaluationLevel): string {
  return LEVEL_COMMENTS[level];
}
