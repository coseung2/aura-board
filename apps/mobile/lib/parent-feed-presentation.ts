import type { PortfolioCardDTO } from "./types";

export function resolveParentFeedAuthor(
  card: PortfolioCardDTO,
  childName: string,
): string {
  if (card.sourceBoard.anonymousAuthor) return "익명";
  return (
    card.studentAuthorName?.trim() ||
    card.externalAuthorName?.trim() ||
    card.authorName?.trim() ||
    childName
  );
}

export function countParentFeedAttachments(card: PortfolioCardDTO): number {
  const urls = new Set(
    card.attachments.map((attachment) => attachment.url).filter(Boolean),
  );
  for (const url of [card.imageUrl, card.videoUrl, card.fileUrl]) {
    if (url) urls.add(url);
  }
  return urls.size;
}
