"use client";

import { memo, useMemo, useState } from "react";
import { CardAttachments } from "../CardAttachments";
import { CardAuthorFooter } from "./CardAuthorFooter";
import { CanvaAttribution } from "../canva/CanvaAttribution";
import { extractCanvaDesignId } from "@/lib/canva-url";
import { CardEngagement } from "../engagement/CardEngagement";
import { HiddenContentPlaceholder, StudentContentModerationControls, useStudentContentHidden } from "../moderation/StudentContentModeration";

const CONTENT_PREVIEW_CHAR_LIMIT = 150;
const CONTENT_PREVIEW_LINE_LIMIT = 5;

type Props = { card: { id?: string; title: string; content: string; imageUrl?: string | null; thumbUrl?: string | null; linkUrl?: string | null; linkTitle?: string | null; linkDesc?: string | null; linkImage?: string | null; videoUrl?: string | null; fileUrl?: string | null; fileName?: string | null; fileSize?: number | null; fileMimeType?: string | null; attachments?: Array<{ id: string; kind: string; url: string; previewUrl?: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null; order: number }>; externalAuthorName?: string | null; studentAuthorId?: string | null; studentAuthorName?: string | null; authorName?: string | null; authors?: Array<{ order: number; displayName: string }>; createdAt?: string | Date | null; likeCount?: number; commentCount?: number; isLiked?: boolean; canInteract?: boolean; canModerate?: boolean; hiddenReason?: "item" | "author" | null; anonymousAuthor?: boolean }; titleAs?: "h2" | "h3" | "h4"; showAuthorFooter?: boolean; showEngagement?: boolean; onEditAuthors?: () => void; attachmentsVariant?: "thumbnail" | "detail"; contentDisplay?: "expandable" | "static" | "full"; boardId?: string; isStudentViewer?: boolean };
function isLongContent(content: string): boolean { if (content.length > CONTENT_PREVIEW_CHAR_LIMIT) return true; return content.split(/\r\n|\r|\n/).length > CONTENT_PREVIEW_LINE_LIMIT; }
export const CardBody = memo(function CardBody({ card, titleAs = "h3", showAuthorFooter = true, showEngagement = true, onEditAuthors, attachmentsVariant = "thumbnail", contentDisplay = "expandable", boardId, isStudentViewer }: Props) {
  const Title = titleAs; const [isExpanded, setIsExpanded] = useState(false);
  const canToggleContent = useMemo(() => contentDisplay === "expandable" && isLongContent(card.content), [card.content, contentDisplay]);
  const contentClassName = ["padlet-card-content", canToggleContent && !isExpanded ? "is-collapsed" : ""].filter(Boolean).join(" ");
  const hasCanvaAttachment = Boolean((card.linkUrl && extractCanvaDesignId(card.linkUrl)) || card.attachments?.some((attachment) => Boolean(extractCanvaDesignId(attachment.url))));
  const isThumbnailCard = attachmentsVariant === "thumbnail";
  const editAuthorsAction = onEditAuthors ? <button type="button" className="card-author-edit-action" onClick={(e) => { e.stopPropagation(); onEditAuthors(); }} onMouseDown={(e) => e.stopPropagation()}>👥 작성자 지정</button> : null;
  const initialCounts = card.likeCount !== undefined || card.commentCount !== undefined ? { likeCount: card.likeCount ?? 0, commentCount: card.commentCount ?? 0, isLiked: card.isLiked, canInteract: card.canInteract } : undefined;
  const { hidden, setHidden } = useStudentContentHidden("card", card.id ?? "", card.hiddenReason ?? null, card.studentAuthorId);
  if (card.id && hidden) return <HiddenContentPlaceholder targetKind="card" targetId={card.id} reason={hidden.reason} hiddenStudentId={hidden.hiddenStudentId} onRestored={() => { setHidden(null); window.location.reload(); }} />;
  const moderationAction = isStudentViewer && card.id && card.canModerate ? <StudentContentModerationControls targetKind="card" targetId={card.id} authorStudentId={card.studentAuthorId} /> : null;
  return <><CardAttachments imageUrl={card.imageUrl} thumbUrl={card.thumbUrl} linkUrl={card.linkUrl} linkTitle={card.linkTitle} linkDesc={card.linkDesc} linkImage={card.linkImage} videoUrl={card.videoUrl} fileUrl={card.fileUrl} fileName={card.fileName} fileSize={card.fileSize} fileMimeType={card.fileMimeType} attachments={card.attachments} variant={attachmentsVariant} />{(card.title.trim() || (isThumbnailCard && hasCanvaAttachment)) && <div className="padlet-card-title-row">{card.title.trim() && <Title className="padlet-card-title">{card.title}</Title>}{isThumbnailCard && hasCanvaAttachment && <CanvaAttribution />}</div>}{card.content.trim() && <p className={contentClassName}>{card.content}</p>}{canToggleContent && <button type="button" className="padlet-card-content-toggle" aria-expanded={isExpanded} onClick={(e) => { e.stopPropagation(); setIsExpanded((value) => !value); }} onMouseDown={(e) => e.stopPropagation()}>{isExpanded ? "접기" : "더보기"}<span aria-hidden="true">{isExpanded ? "▴" : "▾"}</span></button>}{showAuthorFooter && <CardAuthorFooter authors={card.authors} externalAuthorName={card.externalAuthorName} studentAuthorName={card.studentAuthorName} authorName={card.authorName} createdAt={card.createdAt} anonymousAuthor={card.anonymousAuthor} />}{showEngagement && card.id ? <CardEngagement cardId={card.id} mode="chips" boardId={boardId} isStudentViewer={isStudentViewer} initialCounts={initialCounts} chipsActionsEnd={<>{editAuthorsAction}{moderationAction}</>} /> : editAuthorsAction ? <div className="card-engagement-chips">{editAuthorsAction}</div> : null}</>;
});
