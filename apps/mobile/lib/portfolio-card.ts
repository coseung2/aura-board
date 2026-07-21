import { getApiBase } from "./api";
import type {
  BoardCard,
  CardAttachment,
  PortfolioCardDTO,
} from "./types";

type FallbackAuthor = {
  id: string | null;
  name: string;
};

type PortfolioCardOptions = {
  fallbackAuthor?: FallbackAuthor | null;
};

const ATTACHMENT_KINDS = new Set<CardAttachment["kind"]>([
  "image",
  "video",
  "file",
  "link",
]);

function isAttachmentKind(value: string): value is CardAttachment["kind"] {
  return ATTACHMENT_KINDS.has(value as CardAttachment["kind"]);
}

/** Resolve API-relative resources without turning playable URLs into image proxies. */
export function resolvePortfolioResourceUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const apiBase = getApiBase();

  try {
    const apiUrl = new URL(apiBase);
    const resourceUrl = new URL(value, apiUrl);
    const isCanonicalAuraAsset =
      resourceUrl.hostname === "aura-board.com" ||
      resourceUrl.hostname === "www.aura-board.com";

    if (isCanonicalAuraAsset && resourceUrl.origin !== apiUrl.origin) {
      return `${apiUrl.origin}${resourceUrl.pathname}${resourceUrl.search}${resourceUrl.hash}`;
    }
    return resourceUrl.toString();
  } catch {
    return value;
  }
}

/** Keep student web/Expo preview behavior for external image resources. */
export function resolvePortfolioPreviewUrl(
  value: string | null | undefined,
): string | null {
  const resourceUrl = resolvePortfolioResourceUrl(value);
  if (!resourceUrl) return null;

  try {
    const apiOrigin = new URL(getApiBase()).origin;
    const previewUrl = new URL(resourceUrl);
    if (previewUrl.origin !== apiOrigin) {
      return `${apiOrigin}/api/link-preview/image?url=${encodeURIComponent(
        previewUrl.toString(),
      )}`;
    }
  } catch {
    return resourceUrl;
  }

  return resourceUrl;
}

/** Convert student/parent portfolio DTOs into the shared student feed contract. */
export function portfolioCardToBoardCard(
  card: PortfolioCardDTO,
  options: PortfolioCardOptions = {},
): BoardCard {
  const fallbackName = options.fallbackAuthor?.name.trim() || null;
  const authors = [...card.authors]
    .sort((a, b) => a.order - b.order)
    .map((author) => ({
      id: author.id,
      studentId: author.studentId,
      displayName: author.displayName,
    }));

  if (authors.length === 0 && fallbackName) {
    authors.push({
      id: `${card.id}:fallback-author`,
      studentId: options.fallbackAuthor?.id ?? null,
      displayName: fallbackName,
    });
  }

  const attachments = card.attachments
    .filter(
      (attachment): attachment is typeof attachment & {
        kind: CardAttachment["kind"];
      } => isAttachmentKind(attachment.kind),
    )
    .sort((a, b) => a.order - b.order)
    .map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      url:
        (attachment.kind === "image"
          ? resolvePortfolioPreviewUrl(attachment.url)
          : resolvePortfolioResourceUrl(attachment.url)) ?? attachment.url,
      previewUrl: resolvePortfolioPreviewUrl(attachment.previewUrl),
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      order: attachment.order,
    }));

  const firstStudentAuthor = authors.find((author) => author.studentId);

  return {
    id: card.id,
    boardId: card.sourceBoard.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: resolvePortfolioPreviewUrl(card.imageUrl ?? card.thumbUrl),
    thumbUrl: resolvePortfolioPreviewUrl(card.thumbUrl),
    linkUrl: resolvePortfolioResourceUrl(card.linkUrl),
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: resolvePortfolioPreviewUrl(card.linkImage),
    videoUrl: resolvePortfolioResourceUrl(card.videoUrl),
    fileUrl: resolvePortfolioResourceUrl(card.fileUrl),
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
    x: 0,
    y: 0,
    width: card.width,
    height: card.height,
    order: null,
    sectionId: card.sourceSection?.id ?? null,
    authorId: null,
    externalAuthorName: card.externalAuthorName,
    studentAuthorId:
      firstStudentAuthor?.studentId ?? options.fallbackAuthor?.id ?? null,
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
    likeCount: card.likeCount,
    commentCount: card.commentCount,
    attachments,
    authors,
    authorName: card.authorName ?? fallbackName,
    studentAuthorName: card.studentAuthorName ?? fallbackName,
    anonymousAuthor: card.sourceBoard.anonymousAuthor,
  };
}
