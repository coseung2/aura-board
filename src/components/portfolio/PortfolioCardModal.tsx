"use client";

import { useEffect } from "react";
import { CardBody } from "../cards/CardBody";
import { CardEngagement } from "../engagement/CardEngagement";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import { buildSourceLabel } from "./source-label";

// student-portfolio (2026-04-26): 카드 클릭 시 in-place view 모달.
// 원본 보드로 navigate 하지 않고 그 자리에서 풀 콘텐츠 노출.
//
// PortfolioCardDTO 는 author 필드가 없어서 CardBody 의 CardAuthorFooter 가
// null 반환 → 자랑해요(student dashboard strip) 컨텍스트에서 게시자 정보
// 자동 숨김. 포트폴리오 그리드는 학생 단위 컨텍스트라 author 안 보여도
// 학생 명단에서 누구 작품인지 명확.

type Props = {
  card: PortfolioCardDTO | null;
  onClose: () => void;
  /** 출처 라벨(보드·칼럼) 표시 여부. 기본 true. */
  showSource?: boolean;
};

export function PortfolioCardModal({ card, onClose, showSource = true }: Props) {
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  if (!card) return null;

  const sourceLabel = buildSourceLabel({
    boardTitle: card.sourceBoard.title,
    boardLayout: card.sourceBoard.layout,
    sectionTitle: card.sourceSection?.title ?? null,
  });
  const deepLink = `/board/${card.sourceBoard.slug}`;

  return (
    <div
      className="portfolio-card-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={card.title || "작품 보기"}
    >
      <div
        className="portfolio-card-modal"
        style={{ backgroundColor: card.color ?? undefined }}
      >
        <button
          type="button"
          className="portfolio-card-modal-close"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>
        <div className="portfolio-card-modal-body">
          <CardBody
            card={{ ...card, anonymousAuthor: card.sourceBoard.anonymousAuthor }}
            titleAs="h3"
            showEngagement={false}
            attachmentsVariant="detail"
          />
          <CardEngagement cardId={card.id} mode="panel" />
        </div>
        {showSource && (
          <div className="portfolio-card-modal-foot">
            <span className="portfolio-card-modal-source">출처: {sourceLabel}</span>
            <a
              href={deepLink}
              className="portfolio-card-modal-deep-link"
              aria-label="원본 보드로 이동"
            >
              원본 보드 →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
