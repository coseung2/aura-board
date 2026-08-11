import type { AttachmentDraft } from "./cards/useCardAttachments";

export type AddCardData = {
  title: string;
  content: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDesc?: string;
  linkImage?: string;
  attachments?: AttachmentDraft[];
  color?: string;
  sectionId?: string;
  authors?: CardAuthorDraft[];
  commentVoteOptionCount?: number | null;
  commentVoteOptionLabels?: string[] | null;
};

export type SectionOption = { id: string; title: string };
export type StudentOption = { id: string; name: string; number: number | null };
export type CardAuthorDraft = {
  studentId?: string | null;
  displayName: string;
};
export type AuthorDraftRow = CardAuthorDraft & {
  key: string;
  studentId: string | null;
};

export const COLOR_PRESETS = [
  null,
  "#ffd8f4",
  "#c3faf5",
  "#ffe6cd",
  "#fde0f0",
  "#f2f9ff",
  "#ffc6c6",
  "#f6f5f4",
  "#e8f5e9",
  "#fff3e0",
];

export const IMAGE_ACCEPT = "image/*";
export const VIDEO_ACCEPT = "video/*";
export const FILE_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx," +
  "text/plain,text/markdown,text/x-markdown,text/html,application/zip,application/x-zip-compressed," +
  "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm," +
  ".pdf,.docx,.xlsx,.pptx,.hwp,.hwpx,.txt,.md,.markdown,.html,.htm,.zip,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm";

export function buildLinkTextBlock(
  title: string | null | undefined,
  description: string | null | undefined,
): string {
  const normalizedTitle = (title ?? "").trim();
  const normalizedDescription = (description ?? "").trim();
  if (!normalizedTitle && !normalizedDescription) return "";
  if (normalizedTitle && normalizedDescription) {
    return `**${normalizedTitle}**\n\n${normalizedDescription}`;
  }
  return normalizedTitle || normalizedDescription;
}
