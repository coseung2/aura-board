import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { ALLOWED_FILE_MIMES, isAllowedFileUpload, normalizeUploadMime } from "@/lib/file-attachment";
import { ALLOWED_IMAGE, ALLOWED_VIDEO, MAX_SIZE, UploadPolicyError } from "./upload-policy";
import { resizeBufferToWebPPreview, uploadWebPBuffer, extractVideoThumbnail } from "@/lib/blob";
import { uploadPublicObject } from "@/lib/media-storage";

/**
 * card-file-attachment — 매직바이트 검증.
 * file.type(multipart 메타)은 클라이언트가 조작 가능하므로, 실제 바이트의
 * 파일 시그니처로 MIME 스푸핑(악성 스크립트를 application/pdf로 위장)을 차단.
 * PDF ("%PDF-")와 ZIP("PK\x03\x04") 계열(DOCX/XLSX/PPTX/HWPX/ZIP)만 엄격
 * 검사. TXT는 매직 없음 → 허용 (실행 위험 최소). HWP(구버전)는 시그니처가
 * 다양해 스킵하되 확장자+MIME 화이트리스트로 억제.
 */
function verifyFileMagic(mime: string, filename: string, head: Buffer): boolean {
  const lower = filename.toLowerCase();
  // PDF — %PDF-
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return head.length >= 5 && head.toString("ascii", 0, 5) === "%PDF-";
  }
  // ZIP 계열 (OOXML + 순수 ZIP + HWPX): PK\x03\x04
  const isZipFamily =
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    mime.includes("openxmlformats-officedocument") ||
    mime === "application/vnd.hancom.hwpx" ||
    lower.endsWith(".zip") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".pptx") ||
    lower.endsWith(".hwpx");
  if (isZipFamily) {
    return (
      head.length >= 4 &&
      head[0] === 0x50 && head[1] === 0x4b &&
      head[2] === 0x03 && head[3] === 0x04
    );
  }
  // HWP(구버전)·TXT — 시그니처 검증 생략. MIME+확장자+크기 제한으로 억제.
  return true;
}

export async function POST(req: Request) {
  try {
    // 교사(NextAuth) 또는 학생(HMAC bearer/cookie) 중 하나만 있으면 허용.
    // 모바일 학생 앱이 카드/과제 첨부를 직접 업로드할 수 있게 하기 위함.
    const teacher = await getCurrentUser().catch(() => null);
    if (!teacher) {
      const student = await getCurrentStudent();
      if (!student) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    // 이전 Vercel Blob client-direct JSON 프로토콜은 제거됐다.
    // 신규 클라이언트는 multipart로 이 라우트에 업로드하고, 서버가 MIME/
    // 확장자/매직바이트를 검증한 뒤 Supabase Storage에 저장한다.
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // 이전 Vercel Blob client-direct 프로토콜. 신규 클라이언트는 multipart로
      // 이 라우트에 업로드하고, 서버가 Supabase Storage에 저장한다.
      return NextResponse.json(
        { error: "Vercel Blob direct upload is disabled; use multipart upload" },
        { status: 410 },
      );
    }

    // multipart 경로 — 서버 검증 후 Supabase Storage canonical 저장소에 업로드.
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      console.error(`[upload reject] oversize name=${file.name} size=${file.size} type=${file.type}`);
      return NextResponse.json(
        { error: `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB, 최대 50MB)` },
        { status: 400 }
      );
    }

    // OneDrive 드래그·Files On-Demand 등에서 브라우저가 file.type을
    // 비우거나 application/octet-stream으로 보내는 케이스 정상화.
    // 확장자로 canonical MIME을 추론하고, 이후 모든 화이트리스트/매직바이트
    // 검사는 정상화된 MIME을 사용한다.
    const normalizedMime = normalizeUploadMime(file.type ?? "", file.name);

    const isImage = (ALLOWED_IMAGE as readonly string[]).includes(normalizedMime);
    const isVideo = (ALLOWED_VIDEO as readonly string[]).includes(normalizedMime);
    // card-file-attachment: 문서 7종은 MIME + 확장자 AND 검증 (스푸핑 방어 R1)
    const isFile = !isImage && !isVideo && isAllowedFileUpload(normalizedMime, file.name);

    if (!isImage && !isVideo && !isFile) {
      console.error(
        `[upload reject] unsupported name=${file.name} rawType=${file.type} normalized=${normalizedMime}`
      );
      return NextResponse.json(
        {
          error: `지원하지 않는 파일 형식 (${normalizedMime || "type 없음"}, 파일=${file.name})`,
        },
        { status: 400 }
      );
    }

    const fallbackExt = isImage ? "png" : isVideo ? "mp4" : "bin";
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? fallbackExt;
    // 확장자 화이트리스트: 업로드된 파일이 실제로 허용 MIME에 매핑된 확장자만 허용.
    const allowedExts = isFile
      ? ALLOWED_FILE_MIMES[normalizedMime] ?? []
      : null;
    const safeExt = /^[a-z0-9]+$/.test(rawExt)
      ? allowedExts
        ? allowedExts.includes(rawExt) ? rawExt : (allowedExts[0] ?? fallbackExt)
        : rawExt
      : fallbackExt;
    const filename = `${Date.now()}-${randomBytes(3).toString("hex")}.${safeExt}`;
    const pathname = `uploads/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // card-file-attachment: 파일 경로만 매직바이트 검사. 이미지/비디오는
    // 기존 경로라 회귀 위험을 피함 (기존 정책 유지).
    if (isFile && !verifyFileMagic(normalizedMime, file.name, buffer.subarray(0, 16))) {
      const head = buffer.subarray(0, 8).toString("hex");
      console.error(
        `[upload reject] magic-mismatch name=${file.name} normalized=${normalizedMime} head=${head}`
      );
      return NextResponse.json(
        {
          error: `파일 내용이 형식과 일치하지 않아요 (head=${head}, 파일=${file.name}). 파일이 손상되었거나 다른 형식일 수 있어요.`,
        },
        { status: 400 }
      );
    }

    // card-file-attachment: 파일은 항상 attachment로 서빙 (PDF 포함).
    // 인라인 뷰어 경로는 사용자 피드백(2026-04-20)으로 제거됨 —
    // "미리보기 어차피 안띄울거니까 파일명이랑 다운로드 버튼만". Blob에
    // 저장 시부터 강제 다운로드 지시를 심어 두면 새 탭 오픈 시 활성
    // 콘텐츠 실행 위험도 자동으로 억제됨 (보안 이득 겸함).
    // 파일명은 RFC 6266 per-encode (ASCII fallback + UTF-8 확장).
    const asciiName = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    const utf8Name = encodeURIComponent(file.name);
    const contentDisposition = isFile
      ? `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
      : undefined;

    // Blob에 저장할 contentType도 정상화된 MIME으로. 그래야 다운로드 시
    // 올바른 Content-Type 헤더가 설정되어 파일이 정상 인식됨.
    const storedContentType = normalizedMime || "application/octet-stream";

    // Supabase Storage 우선. 환경변수가 없으면 기존 Vercel Blob/로컬 fs로
    // fallback 하여 로컬 개발과 임시 롤백이 가능하게 둔다.
    const stored = await uploadPublicObject(pathname, buffer, {
      contentType: storedContentType,
      contentDisposition,
      multipart: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    const url = stored.url;

    const type: "image" | "video" | "file" = isImage ? "image" : isVideo ? "video" : "file";
    let previewUrl: string | null = null;
    if (isImage) {
      try {
        const preview = await resizeBufferToWebPPreview(buffer, 640, 75);
        previewUrl = await uploadWebPBuffer(
          preview,
          `uploads/previews/${Date.now()}-${randomBytes(3).toString("hex")}.webp`
        );
      } catch (e) {
        console.warn("[POST /api/upload] preview generation failed:", e);
      }
    } else if (isVideo) {
      // Video thumbnail extraction (async, non-blocking)
      try {
        previewUrl = await extractVideoThumbnail(
          url, // Use the uploaded video URL as source
          `uploads/previews/${Date.now()}-${randomBytes(3).toString("hex")}.webp`
        );
      } catch (e) {
        console.warn("[POST /api/upload] video thumbnail extraction failed:", e);
      }
    }
    return NextResponse.json({
      url,
      previewUrl,
      type,
      name: file.name,
      size: file.size,
      // 정상화된 MIME을 반환해야 서버의 isAllowedStoredMime 재검증 통과.
      mimeType: normalizedMime,
    });
  } catch (e) {
    // 정책 거부는 사용자 입력 이슈 → 400으로 매핑해 UI가 적절히 토스트.
    if (e instanceof UploadPolicyError) {
      console.error("[POST /api/upload] policy reject:", e.message);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/upload]", e);
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
