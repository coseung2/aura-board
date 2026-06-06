"use client";

import heic2any from "heic2any";
import { upload } from "@vercel/blob/client";
import { normalizeUploadMime, mimeFromExtension } from "./file-attachment";

export type UploadedFile = {
  url: string;
  previewUrl?: string | null;
  type: "image" | "video" | "file";
  name: string;
  size: number;
  mimeType: string;
};

/**
 * upload-payload-too-large — 클라이언트 직접 업로드.
 * @vercel/blob/client `upload()`로 토큰을 받아 브라우저가 Blob 스토리지에
 * 직접 PUT. 함수 본문 4.5MB 한도(FUNCTION_PAYLOAD_TOO_LARGE)를 우회.
 *
 * HEIC/HEIF 파일은 브라우저 호환성을 위해 JPEG로 자동 변환 후 업로드한다.
 * (samsung-auditorium-fix)
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  // HEIC/HEIF → JPEG 변환 (브라우저 미지원 포맷 선제 대응)
  const targetFile = await maybeConvertHeic(file);

  const mimeType = normalizeUploadMime(targetFile.type ?? "", targetFile.name) ||
    mimeFromExtension(targetFile.name) ||
    "application/octet-stream";

  // 파일명 safe-ascii 버킷화 + 타임스탬프. addRandomSuffix: true 가
  // 서버 정책으로 걸려 있어 충돌 방지는 Blob이 담당.
  const safeName = targetFile.name.replace(/[^\w.\-]/g, "_");
  const pathname = `uploads/${Date.now()}-${safeName}`;

  const res = await upload(pathname, targetFile, {
    access: "public",
    contentType: mimeType,
    handleUploadUrl: "/api/upload",
    multipart: true,
    // 서버 onBeforeGenerateToken 에서 MIME/확장자 화이트리스트 검증에 사용.
    clientPayload: JSON.stringify({ mimeType }),
  });

  const kind: UploadedFile["type"] = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("video/")
      ? "video"
      : "file";

  // 파일 계열은 downloadUrl(쿼리 `?download=1`)을 저장 — 브라우저가 새 탭에서
  // 인라인 렌더하지 않고 강제 다운로드하도록. PDF/HWP/DOCX 등 활성 콘텐츠
  // 실행 위험 억제. 이미지/비디오는 기존대로 url(인라인 렌더 가능).
  return {
    url: kind === "file" ? res.downloadUrl : res.url,
    previewUrl: null,
    type: kind,
    name: file.name, // 원본 파일명 유지 (UI 표시용)
    size: file.size,
    mimeType,
  };
}

/** HEIC/HEIF 파일이면 JPEG Blob으로 변환, 아니면 원본 반환. */
async function maybeConvertHeic(file: File): Promise<File> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  try {
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.92,
    });
    const jpgBlob = Array.isArray(result) ? result[0] : result;
    const jpgName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([jpgBlob], jpgName, { type: "image/jpeg" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    throw new Error(
      `HEIC→JPEG 변환 실패 (${msg}). JPEG/PNG로 변환 후 다시 시도해주세요.`,
    );
  }
}
