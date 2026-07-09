// 웹 src/lib/layout-meta.ts 와 1:1 동일한 레이아웃 메타데이터.
// Board.layout 문자열 → { emoji, label }. 양쪽 동기화 유지 책임은 수동 —
// 추후 packages/shared/ 로 추출 대상.

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
  | "speed-game"
  | "shadow-alliance"
  | "plant-roadmap"
  | "event-signup"
  | "question-board";

export const LAYOUT_THUMBNAILS: Partial<Record<LayoutKey, string>> = {
  freeform: "/board-type-thumbnails/card-board.png",
  columns: "/board-type-thumbnails/topic-board.png",
  "dj-queue": "/board-type-thumbnails/dj-board.png",
  "plant-roadmap": "/board-type-thumbnails/plant-roadmap.png",
};

export const LAYOUT_META: Record<LayoutKey, { emoji: string; label: string }> =
  {
    freeform: { emoji: "🗂️", label: "카드 보드" },
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
    "speed-game": { emoji: "⚡", label: "스피드게임" },
    "shadow-alliance": { emoji: "♟", label: "그림자연합" },
    "plant-roadmap": { emoji: "🌱", label: "식물 관찰일지" },
    "event-signup": { emoji: "🎪", label: "행사 신청" },
    "question-board": { emoji: "💭", label: "질문 보드" },
  };

export function layoutEmoji(layout: string): string {
  return (
    (LAYOUT_META as Record<string, { emoji: string; label: string }>)[layout]
      ?.emoji ?? "📋"
  );
}
export function layoutLabel(layout: string): string {
  return (
    (LAYOUT_META as Record<string, { emoji: string; label: string }>)[layout]
      ?.label ?? layout
  );
}

export function layoutThumbnail(layout: string): string | null {
  return (
    (LAYOUT_THUMBNAILS as Record<string, string | undefined>)[layout] ?? null
  );
}
