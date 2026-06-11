import { extractChannelHandle, extractVideoId } from "@/lib/youtube";

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

// A YouTube channel / @handle / custom / user URL — these are YouTube
// pages too but they resolve to a profile, not a video, so the card UI
// should render a link preview (banner + name + description) rather than
// an inline iframe embed.
export function isYouTubeChannelLink(linkUrl?: string | null): boolean {
  if (!linkUrl) return false;
  if (extractVideoId(linkUrl)) return false;
  return Boolean(extractChannelHandle(linkUrl));
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
  // Channels keep the link as a real "link" (no inline embed) so they
  // behave the same as any other web link — promote when there's no
  // higher-priority media on the card. The two branches below currently
  // collapse to the same boolean but are split so future per-kind
  // tweaks (e.g. "never promote a channel link on this layout") only
  // need to touch one site.
  if (isYouTubeChannelLink(input.linkUrl)) {
    return Boolean(input.linkUrl && !hasPrimaryNonLinkContent(input));
  }
  return Boolean(input.linkUrl && !hasPrimaryNonLinkContent(input));
}
