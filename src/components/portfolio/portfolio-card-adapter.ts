"use client";

import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import type { CardData } from "../DraggableCard";

export function portfolioCardToCardData(card: PortfolioCardDTO): CardData {
  return {
    id: card.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl,
    thumbUrl: card.thumbUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
    attachments: card.attachments,
    x: 0,
    y: 0,
    width: card.width,
    height: card.height,
    order: 0,
    authorId: null,
    studentAuthorId: null,
    createdAt: card.createdAt,
    anonymousAuthor: card.sourceBoard.anonymousAuthor,
  };
}
