"use client";

import { normalizeUploadMime, mimeFromExtension } from "./file-attachment";

export type UploadedFile = {
  url: string;
  previewUrl?: string | null;
  type: "image" | "video" | "file";
  name: string;
  size: number;
  mimeType: string;
};

const LARGE_IMAGE_REENCODE_THRESHOLD = 4 * 1024 * 1024;
const TARGET_MULTIPART_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_REENCODED_IMAGE_PIXELS = 4_000_000;

/**
 * Multipart upload helper.
 * 서버 라우트가 MIME/확장자/매직바이트를 검증한 뒤 Supabase Storage에 저장한다.
 *
 * HEIC/HEIF 파일은 브라우저 호환성을 위해 JPEG로 자동 변환 후 업로드한다.
 * (samsung-auditorium-fix)
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  // HEIC/HEIF → JPEG 변환 (브라우저 미지원 포맷 선제 대응)
  const targetFile = await prepareFileForMultipartUpload(await maybeConvertHeic(file));

  const mimeType = normalizeUploadMime(targetFile.type ?? "", targetFile.name) ||
    mimeFromExtension(targetFile.name) ||
    "application/octet-stream";

  const form = new FormData();
  form.append("file", targetFile);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => null) as Partial<UploadedFile> & { error?: string } | null;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? `업로드 실패 (${res.status})`);
  }

  const kind: UploadedFile["type"] = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("video/")
      ? "video"
      : "file";

  // 파일 계열은 downloadUrl(쿼리 `?download=1`)을 저장 — 브라우저가 새 탭에서
  // 인라인 렌더하지 않고 강제 다운로드하도록. PDF/HWP/DOCX 등 활성 콘텐츠
  // 실행 위험 억제. 이미지/비디오는 기존대로 url(인라인 렌더 가능).
  return {
    url: json.url,
    previewUrl: json.previewUrl ?? null,
    type: json.type ?? kind,
    name: file.name, // 원본 파일명 유지 (UI 표시용)
    size: file.size,
    mimeType: json.mimeType ?? mimeType,
  };
}

async function prepareFileForMultipartUpload(file: File): Promise<File> {
  const mimeType =
    normalizeUploadMime(file.type ?? "", file.name) ||
    mimeFromExtension(file.name) ||
    "application/octet-stream";

  if (
    file.size <= LARGE_IMAGE_REENCODE_THRESHOLD ||
    !mimeType.startsWith("image/") ||
    mimeType === "image/gif" ||
    mimeType === "image/svg+xml"
  ) {
    return file;
  }

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof File === "undefined"
  ) {
    return file;
  }

  try {
    return await reencodeLargeImage(file);
  } catch (e) {
    console.warn("[uploadFile] image re-encode skipped:", e);
    return file;
  }
}

type LoadedImageSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

async function reencodeLargeImage(file: File): Promise<File> {
  const image = await loadImageSource(file);
  try {
    const baseScale = Math.min(
      1,
      Math.sqrt(MAX_REENCODED_IMAGE_PIXELS / Math.max(1, image.width * image.height))
    );
    const attempts = [
      { type: "image/webp", quality: 0.88, scale: 1 },
      { type: "image/webp", quality: 0.8, scale: 1 },
      { type: "image/webp", quality: 0.72, scale: 1 },
      { type: "image/webp", quality: 0.78, scale: 0.85 },
      { type: "image/jpeg", quality: 0.82, scale: 0.85 },
      { type: "image/jpeg", quality: 0.76, scale: 0.72 },
    ];

    let best: File | null = null;
    for (const attempt of attempts) {
      const width = Math.max(1, Math.round(image.width * baseScale * attempt.scale));
      const height = Math.max(1, Math.round(image.height * baseScale * attempt.scale));
      const blob = await renderImageBlob(image.source, width, height, attempt.type, attempt.quality);
      if (!blob) continue;

      const encoded = new File([blob], renameImageFile(file.name, attempt.type), {
        type: blob.type || attempt.type,
        lastModified: file.lastModified,
      });
      if (!best || encoded.size < best.size) best = encoded;
      if (encoded.size <= TARGET_MULTIPART_IMAGE_BYTES) return encoded;
    }

    return best && best.size < file.size ? best : file;
  } finally {
    image.dispose();
  }
}

async function loadImageSource(file: File): Promise<LoadedImageSource> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("image_load_failed"));
      node.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      dispose: () => {
        img.removeAttribute("src");
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderImageBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  type: string,
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function renameImageFile(name: string, mimeType: string): string {
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  if (/\.[^.]+$/.test(name)) return name.replace(/\.[^.]+$/, `.${ext}`);
  return `${name}.${ext}`;
}

/** HEIC/HEIF 파일이면 JPEG Blob으로 변환, 아니면 원본 반환. */
async function maybeConvertHeic(file: File): Promise<File> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  try {
    const { default: heic2any } = await import("heic2any");
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
