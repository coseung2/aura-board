"use client";

import { memo } from "react";
import {
  fileMimeToIcon,
  fileMimeToLabel,
  formatBytes,
} from "@/lib/file-attachment";
import { DownloadIcon } from "./icons/UiIcons";

type Props = {
  fileUrl: string;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
};

/**
 * card-file-attachment — 통일된 파일 카드 렌더.
 *
 * 아이콘 + 원본 파일명 + 크기/유형 라벨 + 다운로드 버튼 4요소로 구성.
 * PDF도 동일 렌더. 초기 버전의 iframe 인라인 뷰어는 Vercel Blob
 * Content-Disposition=attachment와 충돌해 빈 회색 박스만 노출되는
 * 증상이 있었고(2026-04-20 사용자 보고), 실사용에서 다운로드 후
 * OS PDF 뷰어로 열람하는 흐름이 더 안정적이라 인라인 경로를 제거.
 */
export const CardFileAttachment = memo(function CardFileAttachment({
  fileUrl,
  fileName,
  fileSize,
  fileMimeType,
}: Props) {
  const icon = fileMimeToIcon(fileMimeType ?? "");
  const label = fileMimeToLabel(fileMimeType ?? "");
  const displayName = fileName ?? "파일";
  return (
    <div
      className="card-attach-file"
      aria-label={`첨부된 파일: ${displayName}${fileSize ? `, ${formatBytes(fileSize)}` : ""}`}
    >
      <span className="card-attach-file-icon" aria-hidden>
        {icon}
      </span>
      <div className="card-attach-file-body">
        <span className="card-attach-file-name" title={displayName}>
          {displayName}
        </span>
        <span className="card-attach-file-meta">
          {fileSize ? formatBytes(fileSize) : "—"} · {label}
        </span>
      </div>
      <a
        href={fileUrl}
        download={fileName ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="card-attach-file-download"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${displayName} 다운로드`}
        title={`${displayName} 다운로드`}
      >
        <DownloadIcon size={17} />
      </a>
    </div>
  );
});
