import "server-only";

// student-portfolio (2026-04-26): 포트폴리오·자랑해요 API 응답 DTO 타입
// 정의. 보드 컴포넌트의 CardData 와 분리 — 포트폴리오 컨텍스트는 sourceBoard·
// sourceSection 메타가 추가되고 sectionId/boardId 외에 보드 슬러그·제목까지
// 동봉됨.

export type PortfolioCardDTO = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  attachments: Array<{
    id: string;
    kind: string;
    url: string;
    previewUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  sourceBoard: {
    id: string;
    slug: string;
    title: string;
    layout: string;
    /** card-comments-likes (2026-04-26): 보드 단위 작성자 익명 토글. */
    anonymousAuthor: boolean;
  };
  sourceSection: { id: string; title: string } | null;
  /** 호출자(현재 viewer) 가 이 카드를 자랑해요 등록했는지 */
  isShowcasedByMe: boolean;
  /** 카드 단위 자랑해요가 학급 dashboard 에 노출될지 (어떤 학생 슬롯이든
   *  걸려 있으면 true). 다른 학생이 자랑해요 등록한 경우 시각 배지 노출 용도. */
  hasAnyShowcase: boolean;
  createdAt: string;
};

export type PortfolioRosterStudentDTO = {
  id: string;
  name: string;
  number: number | null;
  cardCount: number;
  showcaseCount: number;
};

export type PortfolioRosterDTO = {
  classroom: { id: string; name: string };
  students: PortfolioRosterStudentDTO[];
};

export type PortfolioStudentDTO = {
  student: { id: string; name: string; number: number | null };
  cards: PortfolioCardDTO[];
};

export type ShowcaseEntryDTO = {
  cardId: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
  card: PortfolioCardDTO;
  createdAt: string;
};

/** 카드 출처 라벨 빌더. 주제별 보드(layout=columns) 면 "{보드}·{칼럼}",
 *  그 외 layout 은 "{보드}". 사용자 명시 사양. */
export function buildSourceLabel(card: {
  sourceBoard: { title: string; layout: string };
  sourceSection: { title: string } | null;
}): string {
  if (card.sourceBoard.layout === "columns" && card.sourceSection) {
    return `${card.sourceBoard.title} · ${card.sourceSection.title}`;
  }
  return card.sourceBoard.title;
}
