"use client";

import { memo, useMemo, useState } from "react";
import { CardAttachments } from "../CardAttachments";
import { CardAuthorFooter } from "./CardAuthorFooter";
import { CardEngagement } from "../engagement/CardEngagement";

const CONTENT_PREVIEW_CHAR_LIMIT = 150;
const CONTENT_PREVIEW_LINE_LIMIT = 5;

type Props = {
  card: {
    // card-comments-likes (2026-04-26): id 가 있으면 engagement chips 렌더.
    id?: string;
    title: string;
    content: string;
    imageUrl?: string | null;
    linkUrl?: string | null;
    linkTitle?: string | null;
    linkDesc?: string | null;
    linkImage?: string | null;
    videoUrl?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    fileMimeType?: string | null;
    attachments?: Array<{
      id: string;
      kind: string;
      url: string;
      fileName: string | null;
      fileSize: number | null;
      mimeType: string | null;
      order: number;
    }>;
    externalAuthorName?: string | null;
    studentAuthorName?: string | null;
    authorName?: string | null;
    authors?: Array<{ order: number; displayName: string }>;
    createdAt?: string | Date | null;
    // 보드 단위 익명 토글 (Board.anonymousAuthor) — 호출처에서 주입.
    anonymousAuthor?: boolean;
  };
  // Some layouts (BreakoutBoard, ColumnsBoard) nest cards inside section
  // headings, so semantic level differs. Default h3 matches DraggableCard /
  // StreamBoard / SectionBreakoutView.
  titleAs?: "h3" | "h4";
  // engagement chips 렌더 여부. card.id 가 있을 때만 의미. 기본 true.
  showEngagement?: boolean;
  // 첨부 렌더 모드 — 카드 썸네일은 "thumbnail"(기본), 모달 안에서 풀 콘텐츠를
  // 보여줄 땐 "detail" 로 넘겨 원본 비율을 유지. thumbnail 은 height: 180px +
  // object-fit: cover 라 세로 사진을 가로 strip 으로 크롭함.
  attachmentsVariant?: "thumbnail" | "detail";
  // 일반 보드 카드는 긴 텍스트를 접고 카드 안에서 토글한다.
  // 포트폴리오 그리드는 모달로 전체 내용을 보므로 "static", 상세 모달은 "full".
  contentDisplay?: "expandable" | "static" | "full";
};

function isLongContent(content: string): boolean {
  if (content.length > CONTENT_PREVIEW_CHAR_LIMIT) return true;
  return content.split(/\r\n|\r|\n/).length > CONTENT_PREVIEW_LINE_LIMIT;
}

export const CardBody = memo(function CardBody({
  card,
  titleAs = "h3",
  showEngagement = true,
  attachmentsVariant = "thumbnail",
  contentDisplay = "expandable",
}: Props) {
  const Title = titleAs;
  const [isExpanded, setIsExpanded] = useState(false);
  const canToggleContent = useMemo(
    () => contentDisplay === "expandable" && isLongContent(card.content),
    [card.content, contentDisplay]
  );
  const contentClassName = [
    "padlet-card-content",
    canToggleContent && !isExpanded ? "is-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <CardAttachments
        imageUrl={card.imageUrl}
        linkUrl={card.linkUrl}
        linkTitle={card.linkTitle}
        linkDesc={card.linkDesc}
        linkImage={card.linkImage}
        videoUrl={card.videoUrl}
        fileUrl={card.fileUrl}
        fileName={card.fileName}
        fileSize={card.fileSize}
        fileMimeType={card.fileMimeType}
        attachments={card.attachments}
        variant={attachmentsVariant}
      />
      <Title className="padlet-card-title">{card.title}</Title>
      <p className={contentClassName}>{card.content}</p>
      {canToggleContent && (
        <button
          type="button"
          className="padlet-card-content-toggle"
          aria-expanded={isExpanded}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((value) => !value);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isExpanded ? "접기" : "더보기"}
        </button>
      )}
      <CardAuthorFooter
        authors={card.authors}
        externalAuthorName={card.externalAuthorName}
        studentAuthorName={card.studentAuthorName}
        authorName={card.authorName}
        createdAt={card.createdAt}
        anonymousAuthor={card.anonymousAuthor}
      />
      {showEngagement && card.id && <CardEngagement cardId={card.id} mode="chips" />}
    </>
  );
});
