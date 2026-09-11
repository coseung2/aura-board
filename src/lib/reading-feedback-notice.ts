export function readingFeedbackNotice(score: number | null): string {
  if (score === null) return "피드백이 완성됐어요. 독서 기록에서 확인해 주세요.";
  if (score < 5) return `피드백 ${score}점이에요. 독서 미션 실적은 5점 이상인 기록부터 반영돼요.`;
  return `피드백 ${score}점이에요. 미션 현황에서 달성 조건과 받을 수 있는 보상을 확인해 주세요.`;
}
