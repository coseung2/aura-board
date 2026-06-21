import type { AttachmentDraft } from "./useCardAttachments";
import type { ReactNode } from "react";

type Props = {
  attachment: Pick<AttachmentDraft, "kind" | "url" | "fileName">;
  className?: string;
  children?: ReactNode;
};

export function AttachmentDownloadLink({
  attachment,
  className = "attachment-download-link",
  children = "다운로드",
}: Props) {
  const filename = getAttachmentDisplayName(attachment);

  return (
    <a
      className={className}
      href={buildAttachmentDownloadHref(attachment.url, filename)}
      download={filename}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

export function getAttachmentDisplayName(
  attachment: Pick<AttachmentDraft, "kind" | "fileName">,
): string {
  const name = attachment.fileName?.trim();
  if (name) return name;
  if (attachment.kind === "image") return "이미지";
  if (attachment.kind === "video") return "동영상";
  return "파일";
}

export function buildAttachmentDownloadHref(url: string, filename: string): string {
  const params = new URLSearchParams({
    url,
    filename,
  });
  return `/api/attachments/download?${params.toString()}`;
}
