import { describe, expect, it } from "vitest";
import {
  buildMobileBoardOverview,
  buildMobileSectionSummaries,
  defaultMobileBoardFilter,
  filterMobileBoardRows,
  filterMobileCards,
  summarizeMobileCards,
} from "../../../apps/mobile/lib/mobile-board-overview";
import type {
  BoardCard,
  BoardMeta,
  Section,
} from "../../../apps/mobile/lib/types";

const board = (overrides: Partial<BoardMeta> = {}): BoardMeta => ({
  id: overrides.id ?? "board-1",
  slug: overrides.slug ?? "board-1",
  title: overrides.title ?? "우리 반 보드",
  layout: overrides.layout ?? "grid",
  anonymousAuthor: false,
  ...overrides,
});

const card = (overrides: Partial<BoardCard> = {}): BoardCard => ({
  id: overrides.id ?? "card-1",
  boardId: "board-1",
  title: "관찰 기록",
  content: "본문",
  color: null,
  imageUrl: null,
  linkUrl: null,
  linkTitle: null,
  linkDesc: null,
  linkImage: null,
  videoUrl: null,
  fileUrl: null,
  fileName: null,
  fileSize: null,
  fileMimeType: null,
  x: 0,
  y: 0,
  width: null,
  height: null,
  order: 0,
  sectionId: null,
  authorId: null,
  externalAuthorName: null,
  studentAuthorId: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  anonymousAuthor: false,
  ...overrides,
});

const sections: Section[] = [
  { id: "section-a", boardId: "board-1", title: "생각", order: 0, color: null },
  { id: "section-b", boardId: "board-1", title: "질문", order: 1, color: null },
];

describe("mobile board overview", () => {
  it("puts required breakout selection and live games in the priority view", () => {
    const overview = buildMobileBoardOverview([
      board({
        id: "breakout",
        slug: "breakout",
        title: "모둠 활동",
        layout: "breakout",
        category: "LESSON",
        breakout: {
          assignmentId: "assignment",
          boardSlug: "breakout",
          boardTitle: "모둠 활동",
          groupCapacity: 4,
          selectedSectionId: null,
          groups: [],
        },
      }),
      board({
        id: "quiz",
        slug: "quiz",
        title: "퀴즈",
        layout: "quiz",
        category: "PLAY",
        quizzes: [{ roomCode: "123456", status: "active" }],
      }),
      board({ id: "lesson", title: "수업 자료", cardCount: 8 }),
    ]);

    expect(overview.priorityRows.map((row) => row.board.id)).toEqual([
      "breakout",
      "quiz",
    ]);
    expect(overview.summary).toMatchObject({
      total: 3,
      lesson: 2,
      play: 1,
      priority: 2,
      totalCards: 8,
    });
    expect(defaultMobileBoardFilter(overview)).toBe("priority");
  });

  it("filters board rows by category and searchable status text", () => {
    const overview = buildMobileBoardOverview([
      board({ id: "lesson", title: "과학 토론", category: "LESSON" }),
      board({
        id: "game",
        title: "도전 퀴즈",
        category: "PLAY",
        layout: "quiz",
        quizzes: [{ roomCode: "1", status: "waiting" }],
      }),
    ]);

    expect(filterMobileBoardRows(overview, "play", "").map((row) => row.board.id)).toEqual([
      "game",
    ]);
    expect(filterMobileBoardRows(overview, "all", "시작 대기").map((row) => row.board.id)).toEqual([
      "game",
    ]);
  });
});

describe("mobile card overview", () => {
  const cards = [
    card({
      id: "a",
      sectionId: "section-a",
      isMine: true,
      likeCount: 2,
      commentCount: 1,
      imageUrl: "https://example.com/a.png",
      updatedAt: "2026-07-10T02:00:00.000Z",
    }),
    card({
      id: "b",
      title: "질문 카드",
      sectionId: "section-b",
      commentCount: 3,
      updatedAt: "2026-07-10T03:00:00.000Z",
    }),
    card({
      id: "c",
      title: "기타 카드",
      sectionId: null,
      likeCount: 1,
      updatedAt: "2026-07-10T01:00:00.000Z",
    }),
  ];

  it("summarizes decision-level counts without changing card data", () => {
    expect(summarizeMobileCards(cards, sections)).toEqual({
      total: 3,
      mine: 1,
      media: 1,
      comments: 4,
      likes: 3,
      sections: 2,
    });
  });

  it("builds section summaries including unsectioned cards", () => {
    const result = buildMobileSectionSummaries(cards, sections);
    expect(result.map((section) => [section.id, section.cardCount])).toEqual([
      ["section-a", 1],
      ["section-b", 1],
      [null, 1],
    ]);
    expect(result[1]?.latestCard?.id).toBe("b");
    expect(result[1]?.commentCount).toBe(3);
  });

  it("filters compact card lists by ownership, media, comments, and text", () => {
    expect(filterMobileCards(cards, "mine", "").map((item) => item.id)).toEqual(["a"]);
    expect(filterMobileCards(cards, "media", "").map((item) => item.id)).toEqual(["a"]);
    expect(filterMobileCards(cards, "comments", "").map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterMobileCards(cards, "all", "질문").map((item) => item.id)).toEqual(["b"]);
  });
});
