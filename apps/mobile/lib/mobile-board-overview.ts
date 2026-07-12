import { layoutLabel } from "../theme/layout-meta";
import type { BoardCard, BoardMeta, Section } from "./types";

export type MobileBoardFilter = "priority" | "lesson" | "play" | "all";
export type MobileBoardStatusTone = "accent" | "danger" | "neutral" | "warning";

export type MobileBoardRow = {
  board: BoardMeta;
  cardCount: number;
  category: "LESSON" | "PLAY";
  statusLabel: string;
  statusTone: MobileBoardStatusTone;
  priority: number;
  needsAction: boolean;
  isLive: boolean;
  searchableText: string;
};

export type MobileBoardOverview = {
  rows: MobileBoardRow[];
  priorityRows: MobileBoardRow[];
  lessonRows: MobileBoardRow[];
  playRows: MobileBoardRow[];
  summary: {
    total: number;
    lesson: number;
    play: number;
    priority: number;
    totalCards: number;
  };
};

export type MobileCardFilter = "all" | "mine" | "media" | "comments";

export type MobileCardSummary = {
  total: number;
  mine: number;
  media: number;
  comments: number;
  likes: number;
  sections: number;
};

export type MobileSectionSummary = {
  id: string | null;
  title: string;
  cardCount: number;
  mineCount: number;
  commentCount: number;
  likeCount: number;
  latestCard: BoardCard | null;
};

const boardCardCount = (board: BoardMeta): number =>
  Math.max(0, board.cardCount ?? board._count?.cards ?? 0);

const boardCategory = (board: BoardMeta): "LESSON" | "PLAY" =>
  board.category === "PLAY" ? "PLAY" : "LESSON";

const quizStatus = (board: BoardMeta): string | null =>
  board.quizzes?.[0]?.status ?? null;

const statusForBoard = (
  board: BoardMeta,
): Pick<
  MobileBoardRow,
  "statusLabel" | "statusTone" | "priority" | "needsAction" | "isLive"
> => {
  if (board.breakout) {
    if (!board.breakout.selectedSectionId) {
      return {
        statusLabel: "모둠 선택 필요",
        statusTone: "warning",
        priority: 0,
        needsAction: true,
        isLive: false,
      };
    }
    return {
      statusLabel: "모둠 참여 중",
      statusTone: "accent",
      priority: 1,
      needsAction: false,
      isLive: true,
    };
  }

  if (board.layout === "quiz") {
    const status = quizStatus(board);
    if (status === "active" || status === "running") {
      return {
        statusLabel: "퀴즈 진행 중",
        statusTone: "accent",
        priority: 1,
        needsAction: false,
        isLive: true,
      };
    }
    if (status === "finished") {
      return {
        statusLabel: "퀴즈 종료",
        statusTone: "neutral",
        priority: 4,
        needsAction: false,
        isLive: false,
      };
    }
    return {
      statusLabel: "퀴즈 시작 대기",
      statusTone: "neutral",
      priority: 3,
      needsAction: false,
      isLive: false,
    };
  }

  if (board.layout === "kordle") {
    const live = board.kordleStatus === "LIVE";
    return {
      statusLabel: live ? "꼬들 진행 중" : "꼬들 시작 대기",
      statusTone: live ? "accent" : "neutral",
      priority: live ? 1 : 3,
      needsAction: false,
      isLive: live,
    };
  }

  if (board.layout === "speed-game") {
    const live =
      board.speedGameStatus === "running" ||
      board.speedGameStatus === "active";
    if (live) {
      return {
        statusLabel: "게임 진행 중",
        statusTone: "accent",
        priority: 1,
        needsAction: false,
        isLive: true,
      };
    }
    if (board.speedGameStatus === "finished") {
      return {
        statusLabel: "게임 종료",
        statusTone: "neutral",
        priority: 4,
        needsAction: false,
        isLive: false,
      };
    }
    return {
      statusLabel: "게임 시작 대기",
      statusTone: "neutral",
      priority: 3,
      needsAction: false,
      isLive: false,
    };
  }

  if (board.layout === "shadow-alliance") {
    const live = board.shadowAllianceStatus === "active";
    if (live) {
      return {
        statusLabel: "게임 진행 중",
        statusTone: "accent",
        priority: 1,
        needsAction: false,
        isLive: true,
      };
    }
    if (board.shadowAllianceStatus === "ended") {
      return {
        statusLabel: "게임 종료",
        statusTone: "neutral",
        priority: 4,
        needsAction: false,
        isLive: false,
      };
    }
    return {
      statusLabel: "게임 시작 대기",
      statusTone: "neutral",
      priority: 3,
      needsAction: false,
      isLive: false,
    };
  }

  const count = boardCardCount(board);
  return {
    statusLabel: count > 0 ? `카드 ${count}개` : "새 활동 대기",
    statusTone: "neutral",
    priority: count > 0 ? 2 : 4,
    needsAction: false,
    isLive: false,
  };
};

export function buildMobileBoardOverview(
  boards: BoardMeta[],
): MobileBoardOverview {
  const rows = boards
    .map<MobileBoardRow>((board) => {
      const status = statusForBoard(board);
      const category = boardCategory(board);
      return {
        board,
        category,
        cardCount: boardCardCount(board),
        ...status,
        searchableText: [
          board.title,
          board.description ?? "",
          layoutLabel(board.layout),
          status.statusLabel,
        ]
          .join(" ")
          .toLocaleLowerCase("ko"),
      };
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.board.title.localeCompare(right.board.title, "ko");
    });

  const priorityRows = rows.filter((row) => row.needsAction || row.isLive);
  const lessonRows = rows.filter((row) => row.category === "LESSON");
  const playRows = rows.filter((row) => row.category === "PLAY");

  return {
    rows,
    priorityRows,
    lessonRows,
    playRows,
    summary: {
      total: rows.length,
      lesson: lessonRows.length,
      play: playRows.length,
      priority: priorityRows.length,
      totalCards: rows.reduce((sum, row) => sum + row.cardCount, 0),
    },
  };
}

export function defaultMobileBoardFilter(
  overview: MobileBoardOverview,
): MobileBoardFilter {
  return overview.priorityRows.length > 0 ? "priority" : "all";
}

export function filterMobileBoardRows(
  overview: MobileBoardOverview,
  filter: MobileBoardFilter,
  query: string,
): MobileBoardRow[] {
  const source =
    filter === "priority"
      ? overview.priorityRows
      : filter === "lesson"
        ? overview.lessonRows
        : filter === "play"
          ? overview.playRows
          : overview.rows;
  const normalized = query.trim().toLocaleLowerCase("ko");
  if (!normalized) return source;
  return source.filter((row) => row.searchableText.includes(normalized));
}

export function cardHasMedia(card: BoardCard): boolean {
  return Boolean(
    card.imageUrl ||
      card.thumbUrl ||
      card.linkImage ||
      card.videoUrl ||
      card.fileUrl ||
      card.attachments?.some((attachment) =>
        ["image", "video", "file", "link"].includes(attachment.kind),
      ),
  );
}

export function summarizeMobileCards(
  cards: BoardCard[],
  sections: Section[],
): MobileCardSummary {
  return {
    total: cards.length,
    mine: cards.filter((card) => card.isMine).length,
    media: cards.filter(cardHasMedia).length,
    comments: cards.reduce(
      (sum, card) => sum + Math.max(0, card.commentCount ?? 0),
      0,
    ),
    likes: cards.reduce(
      (sum, card) => sum + Math.max(0, card.likeCount ?? 0),
      0,
    ),
    sections: sections.length,
  };
}

export function filterMobileCards(
  cards: BoardCard[],
  filter: MobileCardFilter,
  query: string,
): BoardCard[] {
  const normalized = query.trim().toLocaleLowerCase("ko");
  return cards.filter((card) => {
    if (filter === "mine" && !card.isMine) return false;
    if (filter === "media" && !cardHasMedia(card)) return false;
    if (filter === "comments" && (card.commentCount ?? 0) <= 0) return false;
    if (!normalized) return true;
    return [
      card.title,
      card.content,
      card.authorName ?? "",
      card.studentAuthorName ?? "",
      card.externalAuthorName ?? "",
      card.linkTitle ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("ko")
      .includes(normalized);
  });
}

export function buildMobileSectionSummaries(
  cards: BoardCard[],
  sections: Section[],
): MobileSectionSummary[] {
  const orderedSections = [...sections].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.title.localeCompare(right.title, "ko");
  });
  const result = orderedSections.map((section) =>
    summarizeSection(section.id, section.title, cards),
  );
  const unsectioned = cards.filter((card) => !card.sectionId);
  if (unsectioned.length > 0) {
    result.push(summarizeSection(null, "기타", unsectioned));
  }
  return result;
}

function summarizeSection(
  id: string | null,
  title: string,
  cards: BoardCard[],
): MobileSectionSummary {
  const sectionCards =
    id === null ? cards.filter((card) => !card.sectionId) : cards.filter((card) => card.sectionId === id);
  const latestCard = [...sectionCards].sort(
    (left, right) =>
      new Date(right.updatedAt || right.createdAt).getTime() -
      new Date(left.updatedAt || left.createdAt).getTime(),
  )[0] ?? null;

  return {
    id,
    title,
    cardCount: sectionCards.length,
    mineCount: sectionCards.filter((card) => card.isMine).length,
    commentCount: sectionCards.reduce(
      (sum, card) => sum + Math.max(0, card.commentCount ?? 0),
      0,
    ),
    likeCount: sectionCards.reduce(
      (sum, card) => sum + Math.max(0, card.likeCount ?? 0),
      0,
    ),
    latestCard,
  };
}
