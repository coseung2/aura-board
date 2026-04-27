"use client";

import { memo } from "react";
import { CardAttachments } from "../CardAttachments";
import { CardAuthorFooter } from "./CardAuthorFooter";
import { CardEngagement } from "../engagement/CardEngagement";

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
};

export const CardBody = memo(function CardBody({ card, titleAs = "h3", showEngagement = true, attachmentsVariant = "thumbnail" }: Props) {
  const Title = titleAs;
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
      <p className="padlet-card-content">{card.content}</p>
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
