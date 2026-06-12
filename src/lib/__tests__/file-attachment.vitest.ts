import { describe, it, expect } from "vitest";
import {
  ALLOWED_FILE_MIMES,
  isAllowedFileUpload,
  isAllowedFileUrl,
  isAllowedStoredMime,
  normalizeUploadMime,
  fileMimeToIcon,
  fileMimeToLabel,
  formatBytes,
} from "../file-attachment";

describe("file-attachment · isAllowedFileUpload", () => {
  it("accepts PDF with .pdf extension", () => {
    expect(isAllowedFileUpload("application/pdf", "report.pdf")).toBe(true);
    expect(isAllowedFileUpload("application/pdf", "report.PDF")).toBe(true);
  });

  it("accepts modern Office formats with matching extensions", () => {
    expect(
      isAllowedFileUpload(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc.docx",
      ),
    ).toBe(true);
    expect(
      isAllowedFileUpload(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "data.xlsx",
      ),
    ).toBe(true);
    expect(
      isAllowedFileUpload(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "deck.pptx",
      ),
    ).toBe(true);
  });

  it("accepts HWP across Korean-specific MIME variants", () => {
    expect(isAllowedFileUpload("application/x-hwp", "a.hwp")).toBe(true);
    expect(isAllowedFileUpload("application/haansofthwp", "a.hwp")).toBe(true);
    expect(isAllowedFileUpload("application/vnd.hancom.hwp", "a.hwp")).toBe(true);
  });

  it("accepts TXT and ZIP", () => {
    expect(isAllowedFileUpload("text/plain", "readme.txt")).toBe(true);
    expect(isAllowedFileUpload("application/zip", "bundle.zip")).toBe(true);
    expect(isAllowedFileUpload("application/x-zip-compressed", "bundle.zip")).toBe(true);
  });

  it("rejects MIME spoofing — PDF MIME with non-pdf extension", () => {
    // 공격자가 application/pdf로 위장한 .js/.exe 파일 업로드 시도 방어.
    expect(isAllowedFileUpload("application/pdf", "malware.js")).toBe(false);
    expect(isAllowedFileUpload("application/pdf", "script.exe")).toBe(false);
  });

  it("rejects unlisted MIME types regardless of extension", () => {
    expect(isAllowedFileUpload("application/x-msdownload", "a.exe")).toBe(false);
    expect(isAllowedFileUpload("image/png", "image.png")).toBe(false); // 이미지 경로는 업로드 라우트의 별도 화이트리스트가 처리
  });
});

describe("file-attachment · normalizeUploadMime", () => {
  it("복구: 브라우저가 사진 MIME을 비우거나 octet-stream으로 보내도 확장자로 이미지 MIME을 추론", () => {
    expect(normalizeUploadMime("", "photo.JPG")).toBe("image/jpeg");
    expect(normalizeUploadMime("application/octet-stream", "screen.png")).toBe("image/png");
    expect(normalizeUploadMime("binary/octet-stream", "sticker.webp")).toBe("image/webp");
  });

  it("기존 명시 MIME은 유지한다", () => {
    expect(normalizeUploadMime("image/png", "photo.jpg")).toBe("image/png");
  });
});

describe("file-attachment · fileMimeToIcon", () => {
  it("returns distinct glyphs for the 8-type matrix", () => {
    const glyphs = new Set<string>();
    glyphs.add(fileMimeToIcon("application/pdf"));
    glyphs.add(fileMimeToIcon("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    glyphs.add(fileMimeToIcon("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    glyphs.add(fileMimeToIcon("application/vnd.openxmlformats-officedocument.presentationml.presentation"));
    glyphs.add(fileMimeToIcon("application/x-hwp"));
    glyphs.add(fileMimeToIcon("text/plain"));
    glyphs.add(fileMimeToIcon("text/html"));
    glyphs.add(fileMimeToIcon("application/zip"));
    // 8개 MIME이 8개 서로 다른 글리프로 매핑되어야 사용자가 유형 구분 가능.
    expect(glyphs.size).toBe(8);
  });

  it("falls back to generic glyph for unknown MIME", () => {
    expect(fileMimeToIcon("application/x-unknown")).toBe("📎");
  });
});

describe("file-attachment · fileMimeToLabel", () => {
  it("returns short Korean/Latin label for each type", () => {
    expect(fileMimeToLabel("application/pdf")).toBe("PDF");
    expect(fileMimeToLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Word");
    expect(fileMimeToLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("Excel");
    expect(fileMimeToLabel("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("PowerPoint");
    expect(fileMimeToLabel("application/x-hwp")).toBe("HWP");
    expect(fileMimeToLabel("text/plain")).toBe("텍스트");
    expect(fileMimeToLabel("text/html")).toBe("HTML");
    expect(fileMimeToLabel("application/zip")).toBe("ZIP");
  });
});

describe("file-attachment · formatBytes", () => {
  it("renders byte, KB, MB, GB boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
  });
});

describe("file-attachment · ALLOWED_FILE_MIMES", () => {
  it("covers exactly the 8 types promised — PDF, Word, Excel, PPT, HWP, TXT, HTML, ZIP", () => {
    // 매핑 키 개수 ≥ 8 (HWP와 ZIP은 여러 MIME 변형 허용이라 키가 더 많을 수 있음)
    expect(Object.keys(ALLOWED_FILE_MIMES).length).toBeGreaterThanOrEqual(8);
    // 최소 한 변형이라도 존재해야 하는 핵심 유형 검증
    const keys = Object.keys(ALLOWED_FILE_MIMES);
    expect(keys).toContain("application/pdf");
    expect(keys.some((k) => k.includes("wordprocessingml"))).toBe(true);
    expect(keys.some((k) => k.includes("spreadsheetml"))).toBe(true);
    expect(keys.some((k) => k.includes("presentationml"))).toBe(true);
    expect(keys.some((k) => k.toLowerCase().includes("hwp"))).toBe(true);
    expect(keys).toContain("text/plain");
    expect(keys).toContain("text/html");
    expect(keys.some((k) => k.includes("zip"))).toBe(true);
  });
});

describe("file-attachment · isAllowedFileUrl (codex security review)", () => {
  it("allows null/undefined (no file attached)", () => {
    expect(isAllowedFileUrl(null)).toBe(true);
    expect(isAllowedFileUrl(undefined)).toBe(true);
    expect(isAllowedFileUrl("")).toBe(true);
  });

  it("allows Vercel Blob public-storage hostnames", () => {
    expect(isAllowedFileUrl("https://abc123.public.blob.vercel-storage.com/uploads/x.pdf")).toBe(true);
    expect(isAllowedFileUrl("https://tenant-name.public.blob.vercel-storage.com/uploads/a.docx")).toBe(true);
  });

  it("allows Supabase Storage public object URLs", () => {
    expect(
      isAllowedFileUrl(
        "https://project-ref.supabase.co/storage/v1/object/public/aura-board-uploads/uploads/x.pdf",
      ),
    ).toBe(true);
  });

  it("allows local /uploads/ paths (dev)", () => {
    expect(isAllowedFileUrl("/uploads/123.pdf")).toBe(true);
    expect(isAllowedFileUrl("http://localhost:3000/uploads/123.pdf")).toBe(true);
  });

  it("rejects arbitrary external URLs (stored-XSS prevention)", () => {
    expect(isAllowedFileUrl("https://attacker.example.com/evil.svg")).toBe(false);
    expect(isAllowedFileUrl("https://cdn.malicious.net/payload.pdf")).toBe(false);
    // 하위 도메인 스푸핑 차단 — public.blob.vercel-storage.com.evil.com 같은 것
    expect(isAllowedFileUrl("https://fake.public.blob.vercel-storage.com.evil.com/x.pdf")).toBe(false);
    expect(isAllowedFileUrl("https://attacker.example.com/storage/v1/object/public/aura-board-uploads/x.pdf")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedFileUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedFileUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isAllowedFileUrl("not a url at all")).toBe(false);
  });
});

describe("file-attachment · isAllowedStoredMime (codex security review)", () => {
  it("allows null (no file)", () => {
    expect(isAllowedStoredMime(null)).toBe(true);
    expect(isAllowedStoredMime(undefined)).toBe(true);
  });
  it("allows document whitelist MIMEs", () => {
    expect(isAllowedStoredMime("application/pdf")).toBe(true);
    expect(
      isAllowedStoredMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isAllowedStoredMime("text/plain")).toBe(true);
  });
  it("rejects image/video MIMEs (must use imageUrl/videoUrl fields)", () => {
    expect(isAllowedStoredMime("image/svg+xml")).toBe(false);
    expect(isAllowedStoredMime("image/png")).toBe(false);
    expect(isAllowedStoredMime("video/mp4")).toBe(false);
  });
  it("rejects active-content MIMEs except HTML (now allowed for card attachment)", () => {
    expect(isAllowedStoredMime("text/html")).toBe(true);
    expect(isAllowedStoredMime("application/javascript")).toBe(false);
    expect(isAllowedStoredMime("application/x-msdownload")).toBe(false);
  });
});
