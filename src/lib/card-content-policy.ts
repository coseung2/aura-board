import { extractVideoId } from "@/lib/youtube";

type AttachmentLike = {
  kind: string;
};

export type CardContentPolicyInput = {
  imageUrl?: string | null;
  linkUrl?: string | null;
  videoUrl?: string | null;
  fileUrl?: string | null;
  attachments?: AttachmentLike[] | null;
};

export function isYouTubeLink(linkUrl?: string | null): boolean {
  return Boolean(linkUrl && extractVideoId(linkUrl));
}

export function hasPrimaryNonLinkContent(input: CardContentPolicyInput): boolean {
  return (
    Boolean(input.imageUrl) ||
    Boolean(input.videoUrl) ||
    Boolean(input.fileUrl) ||
    Boolean(input.attachments?.length) ||
    isYouTubeLink(input.linkUrl)
  );
}

export function shouldPromoteLinkPreview(input: CardContentPolicyInput): boolean {
  return Boolean(input.linkUrl && !hasPrimaryNonLinkContent(input));
}
