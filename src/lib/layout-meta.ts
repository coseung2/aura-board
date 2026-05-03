// 보드 레이아웃 메타데이터 single source of truth.
// Dashboard / StudentDashboard / board/[id] / CreateBoardModal / ClassroomBoardsTab
// 등 여러 곳에서 하던 이모지·라벨 딕셔너리 중복을 하나로 통합.
//
// 새 레이아웃 추가 시 여기만 수정하면 전체 UI가 동기화된다.

export type LayoutKey =
  | "freeform"
  | "grid"
  | "stream"
  | "columns"
  | "assignment"
  | "quiz"
  | "drawing"
  | "breakout"
  | "assessment"
  | "dj-queue"
  | "vibe-arcade"
  | "vibe-gallery"
  | "plant-roadmap"
  | "event-signup"
  | "question-board"
  | "statistics";

export type LayoutMeta = {
  emoji: string;
  label: string;
};

export const LAYOUT_META: Record<LayoutKey, LayoutMeta> = {
  freeform: { emoji: "🎯", label: "자유 배치" },
  grid: { emoji: "🔲", label: "그리드" },
  stream: { emoji: "📜", label: "스트림" },
  columns: { emoji: "📊", label: "주제별 보드" },
  assignment: { emoji: "📋", label: "과제 배부" },
  quiz: { emoji: "🎮", label: "퀴즈" },
  drawing: { emoji: "🎨", label: "그림보드" },
  breakout: { emoji: "👥", label: "모둠 학습" },
  assessment: { emoji: "📝", label: "수행평가" },
  "dj-queue": { emoji: "🎧", label: "DJ 큐" },
  "vibe-arcade": { emoji: "💻", label: "코딩 교실" },
  "vibe-gallery": { emoji: "🖼️", label: "코딩 갤러리" },
  "plant-roadmap": { emoji: "🌱", label: "식물 관찰" },
  "event-signup": { emoji: "🎪", label: "행사 신청" },
  "question-board": { emoji: "💭", label: "질문 보드" },
  statistics: { emoji: "📊", label: "통계활용대회" },
};

/** 미지 layout 문자열 fallback — 문서철 이모지 + 원문 */
export function layoutEmoji(layout: string): string {
  return (LAYOUT_META as Record<string, LayoutMeta>)[layout]?.emoji ?? "📋";
}

export function layoutLabel(layout: string): string {
  return (LAYOUT_META as Record<string, LayoutMeta>)[layout]?.label ?? layout;
}
