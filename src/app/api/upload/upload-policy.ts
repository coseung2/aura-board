import {
  ALLOWED_FILE_MIMES,
  isAllowedFileUpload,
} from "@/lib/file-attachment";

// upload-server-cap-4mb: SVG는 내부 sanitizer가 없는 환경에서 stored-XSS
// (script/onload) 표면이 되기 쉽다. 현재 코드베이스에 SVG 살균기가 없는
// 한 화이트리스트에서 제외한다. 별도 sanitizer 도입 시 다시 허용 검토.
export const ALLOWED_IMAGE = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_VIDEO = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

// upload-server-cap-4mb: Vercel serverless 함수 본문 한도(4.5MB)와
// formData 파싱 메모리 부담을 고려해 이 라우트의 실제 상한은 4MB.
// 50MB는 Vercel에서 413을 만들 거리를 미리 차단하는 의미 있는 변경이다.
// 직접 업로드(direct upload) 토큰 빌더도 같은 상수를 재사용하므로
// 미래의 direct-upload 복귀 시에도 동일하게 4MB가 적용된다.
export const MAX_SIZE = 4 * 1024 * 1024;

export type UploadKind = "image" | "video" | "file";

export type UploadPolicy = {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
  addRandomSuffix: true;
  tokenPayload: string;
};

export type UploadTokenPayload = {
  kind: UploadKind;
  mimeType: string;
  originalName: string;
};

/** 정책 거부 에러 — route.ts의 외부 try/catch 가 이를 HTTP 400으로 매핑. */
export class UploadPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadPolicyError";
  }
}

/**
 * upload-payload-too-large — 클라이언트가 제시한 pathname + clientPayload
 * (MIME)을 화이트리스트 기준으로 검증한 뒤 Blob client-token 생성 옵션을
 * 반환. 함수 본문 한도(4.5MB)를 우회하기 위한 client direct upload 경로의
 * 게이트.
 *
 * 실패 시 에러를 throw — 호출자(onBeforeGenerateToken)는 이를 그대로
 * 상위로 전파해 token 발급을 거부한다.
 */
export function buildUploadPolicy(
  pathname: string,
  clientPayload: string | null,
): UploadPolicy {
  if (!pathname.startsWith("uploads/")) {
    throw new UploadPolicyError("invalid pathname: must start with 'uploads/'");
  }
  // 인코딩된 path separator도 거부 — `%2F`·`%5C`로 우회하지 못하게.
  if (/%2f|%5c/i.test(pathname)) {
    throw new UploadPolicyError("invalid pathname: encoded separators are not allowed");
  }
  const filename = pathname.slice("uploads/".length);
  if (!filename || filename.includes("/") || filename.includes("\\")) {
    throw new UploadPolicyError(
      "invalid pathname: filename must not be empty or contain '/' or '\\'",
    );
  }

  const claimed = parseClientPayload(clientPayload);
  const mime = claimed.mimeType;

  const isImage = (ALLOWED_IMAGE as readonly string[]).includes(mime);
  const isVideo = (ALLOWED_VIDEO as readonly string[]).includes(mime);
  const isFile = !isImage && !isVideo && isAllowedFileUpload(mime, filename);

  if (!isImage && !isVideo && !isFile) {
    throw new UploadPolicyError(
      `지원하지 않는 파일 형식 (${mime || "type 없음"}, 파일=${filename})`,
    );
  }

  const kind: UploadKind = isImage ? "image" : isVideo ? "video" : "file";
  const allowedContentTypes = isImage
    ? [...ALLOWED_IMAGE]
    : isVideo
      ? [...ALLOWED_VIDEO]
      : (ALLOWED_FILE_MIMES[mime] ? [mime] : []);

  const payload: UploadTokenPayload = {
    kind,
    mimeType: mime,
    originalName: filename,
  };

  return {
    allowedContentTypes,
    maximumSizeInBytes: MAX_SIZE,
    addRandomSuffix: true,
    tokenPayload: JSON.stringify(payload),
  };
}

/** clientPayload는 uploadFile()에서 JSON stringify한 { mimeType } shape. */
function parseClientPayload(raw: string | null): { mimeType: string } {
  if (!raw) throw new UploadPolicyError("missing clientPayload");
  let obj: { mimeType?: unknown };
  try {
    obj = JSON.parse(raw) as { mimeType?: unknown };
  } catch {
    throw new UploadPolicyError("invalid clientPayload: not JSON");
  }
  if (typeof obj.mimeType !== "string" || !obj.mimeType) {
    throw new UploadPolicyError("invalid clientPayload: mimeType required");
  }
  return { mimeType: obj.mimeType };
}
