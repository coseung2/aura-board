"use client";

import { CardBody } from "../cards/CardBody";
import type { ShowcaseEntryDTO } from "@/lib/portfolio-dto";

// student-portfolio (2026-04-26): 학급 메인 자랑해요 strip 의 카드.
// 게시자(학생) 정보 표시하지 않고 콘텐츠 풀 노출. PortfolioCardDTO 는
// author 필드가 없어 CardBody 의 CardAuthorFooter 가 자동으로 null
// 반환해 게시자 라인이 사라짐 (사용자 명시 요구).

type Props = {
  entry: ShowcaseEntryDTO;
  /** 카드 클릭 시 부모(strip) 가 in-place 모달 오픈. */
  onOpen: (entry: ShowcaseEntryDTO) => void;
};

export function ShowcaseCardChip({ entry, onOpen }: Props) {
  const card = entry.card;
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(entry);
    }
  }
  return (
    <article
      className="showcase-chip"
      style={{ backgroundColor: card.color ?? undefined }}
      tabIndex={0}
      role="button"
      aria-label={`${card.title || "제목 없음"} - 자세히 보기`}
      onClick={() => onOpen(entry)}
      onKeyDown={onKey}
    >
      <span
        className="showcase-chip-badge"
        aria-hidden
        title="자랑해요"
      >
        🌟
      </span>
      <div className="showcase-chip-body">
        <CardBody
          card={{ ...card, anonymousAuthor: card.sourceBoard.anonymousAuthor }}
          titleAs="h4"
          contentDisplay="static"
        />
      </div>
    </article>
  );
}
