// card-file-attachment — 공용 유틸 (서버/클라이언트 모두)

/** multi-attachment (2026-04-20): 카드 1개당 첨부 최대 개수. */
export const MAX_ATTACHMENTS_PER_CARD = 10;

/** multi-attachment: wire shape 카드 렌더/API 양쪽에서 공유. */
export type AttachmentWire = {
  id: string;
  kind: "image" | "video" | "file";
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  order: number;
};

export const ALLOWED_FILE_MIMES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/x-hwp": ["hwp"],
  "application/haansofthwp": ["hwp"],
  "application/vnd.hancom.hwp": ["hwp"],
  "application/vnd.hancom.hwpx": ["hwpx", "hwp"],
  "text/plain": ["txt"],
  "application/zip": ["zip"],
  "application/x-zip-compressed": ["zip"],
};

/** 허용된 파일 MIME + 확장자 동시 검증 (MIME 스푸핑 방어). */
export function isAllowedFileUpload(mime: string, filename: string): boolean {
  const exts = ALLOWED_FILE_MIMES[mime];
  if (!exts) return false;
  const lowered = filename.toLowerCase();
  return exts.some((ext) => lowered.endsWith(`.${ext}`));
}

/** 확장자 → 기본 MIME 역매핑. OneDrive/드래그드롭 등에서 브라우저가
 *  `file.type`을 비우거나 `application/octet-stream`으로 넘기는 케이스를
 *  복구. 매핑되지 않은 확장자는 null — 업로드 거부. */
const EXT_TO_CANONICAL_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
  txt: "text/plain",
  zip: "application/zip",
};

/** 파일명 확장자에서 canonical MIME을 추론. 매핑 실패 시 null. */
export function mimeFromExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXT_TO_CANONICAL_MIME[ext] ?? null;
}

/** 클라이언트가 보낸 MIME이 비어있거나 generic(octet-stream)일 때
 *  확장자 기반으로 정상화. 그 외는 원본 유지. */
export function normalizeUploadMime(rawMime: string, filename: string): string {
  const generic = !rawMime || rawMime === "application/octet-stream" || rawMime === "binary/octet-stream";
  if (!generic) return rawMime;
  return mimeFromExtension(filename) ?? rawMime;
}

/** MIME → 카드/모달 렌더용 이모지 아이콘. 매핑 실패 시 일반 📎. */
export function fileMimeToIcon(mime: string): string {
  if (mime === "application/pdf") return "🗎";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "📄";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") return "📊";
  if (mime.includes("presentationml") || mime === "application/vnd.ms-powerpoint") return "📽";
  if (mime.includes("hwp") || mime.includes("hancom")) return "📋";
  if (mime === "text/plain") return "📝";
  if (mime.includes("zip")) return "🗜";
  return "📎";
}

/** MIME → 사람이 읽기 쉬운 한 단어 타입 라벨. */
export function fileMimeToLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "Word";
  if (mime.includes("spreadsheetml")) return "Excel";
  if (mime.includes("presentationml")) return "PowerPoint";
  if (mime.includes("hwp") || mime.includes("hancom")) return "HWP";
  if (mime === "text/plain") return "텍스트";
  if (mime.includes("zip")) return "ZIP";
  return "파일";
}

/** bytes → "2.3 MB" 형태 사람 친화 포맷. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * fileUrl이 이 프로젝트의 업로드 경로에서 나온 URL인지 확인.
 * - 프로덕션: `*.public.blob.vercel-storage.com` (Vercel Blob 공식 호스트)
 * - 로컬/개발: 동일 오리진 `/uploads/...` 상대 경로 또는 절대 URL
 *
 * 카드 생성/수정 API가 클라이언트 공급 fileUrl을 이 화이트리스트로 통과시켜야
 * `/api/upload`를 우회한 stored-XSS(예: 외부 svg URL을 fileUrl로 삽입)를 차단.
 */
export function isAllowedFileUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null 허용 (파일 없음 = 명시적 표현)
  // 상대경로 `/uploads/xxx`는 로컬 dev 경로 — 허용.
  if (url.startsWith("/uploads/")) return true;
  try {
    const u = new URL(url);
    // Vercel Blob은 *.public.blob.vercel-storage.com 하위로만 서빙.
    if (u.hostname.endsWith(".public.blob.vercel-storage.com")) return true;
    // 로컬 dev가 절대 URL로 /uploads/를 낼 때.
    if (u.pathname.startsWith("/uploads/")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * card 생성/수정 시 fileMimeType이 업로드 화이트리스트 MIME이거나
 * image/video 기존 경로의 MIME이어야 함. 임의 값 차단.
 */
export function isAllowedStoredMime(mime: string | null | undefined): boolean {
  if (!mime) return true;
  if (mime in ALLOWED_FILE_MIMES) return true;
  // 이미지/비디오 MIME도 파일 필드에 저장될 수 있는가? 설계상 아님. 파일
  // 필드는 오직 문서 화이트리스트만 허용하고, 이미지는 imageUrl, 비디오는
  // videoUrl을 쓰도록 강제.
  return false;
}
