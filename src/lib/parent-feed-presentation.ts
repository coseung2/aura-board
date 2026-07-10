type ParentFeedCardLike = {
  imageUrl: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  externalAuthorName: string | null;
  studentAuthorName: string | null;
  authorName: string | null;
  attachments: Array<{ url: string }>;
  sourceBoard: { anonymousAuthor: boolean };
};

export function resolveParentFeedAuthor(
  card: ParentFeedCardLike,
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

export function countParentFeedAttachments(card: ParentFeedCardLike): number {
  const urls = new Set(
    card.attachments.map((attachment) => attachment.url).filter(Boolean),
  );
  for (const url of [card.imageUrl, card.videoUrl, card.fileUrl]) {
    if (url) urls.add(url);
  }
  return urls.size;
}
