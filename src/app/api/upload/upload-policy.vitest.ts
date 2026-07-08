import { describe, it, expect } from "vitest";
import {
  ALLOWED_IMAGE,
  ALLOWED_VIDEO,
  MAX_SIZE,
  UploadPolicyError,
  buildUploadPolicy,
  type UploadTokenPayload,
} from "./upload-policy";

const payloadFor = (mimeType: string) => JSON.stringify({ mimeType });

describe("upload-policy · buildUploadPolicy (FUNCTION_PAYLOAD_TOO_LARGE 회귀)", () => {
  it("허용 PDF는 policy를 반환한다 — client-direct upload 통과 경로", () => {
    const p = buildUploadPolicy(
      "uploads/1713580000000-report.pdf",
      payloadFor("application/pdf"),
    );
    expect(p.maximumSizeInBytes).toBe(MAX_SIZE);
    expect(p.addRandomSuffix).toBe(true);
    expect(p.allowedContentTypes).toEqual(["application/pdf"]);
    const payload = JSON.parse(p.tokenPayload) as UploadTokenPayload;
    expect(payload.kind).toBe("file");
    expect(payload.mimeType).toBe("application/pdf");
    expect(payload.originalName).toBe("1713580000000-report.pdf");
  });

  it("이미지는 이미지 MIME 허용 목록 전체를 열어 준다", () => {
    const p = buildUploadPolicy("uploads/abc.png", payloadFor("image/png"));
    expect(p.allowedContentTypes).toEqual([...ALLOWED_IMAGE]);
    const payload = JSON.parse(p.tokenPayload) as UploadTokenPayload;
    expect(payload.kind).toBe("image");
    expect(payload.mimeType).toBe("image/png");
  });

  it("동영상은 동영상 MIME 허용 목록 전체를 열어 준다", () => {
    const p = buildUploadPolicy("uploads/clip.mp4", payloadFor("video/mp4"));
    expect(p.allowedContentTypes).toEqual([...ALLOWED_VIDEO]);
    const payload = JSON.parse(p.tokenPayload) as UploadTokenPayload;
    expect(payload.kind).toBe("video");
  });

  it("DOCX 등 OOXML 계열도 통과 (MIME + 확장자 AND 검증)", () => {
    const docxMime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const p = buildUploadPolicy("uploads/note.docx", payloadFor(docxMime));
    expect(p.allowedContentTypes).toEqual([docxMime]);
    const payload = JSON.parse(p.tokenPayload) as UploadTokenPayload;
    expect(payload.kind).toBe("file");
  });

  it("uploads/ 접두가 아니면 거부 — path traversal 기본 방어", () => {
    expect(() =>
      buildUploadPolicy("reports/evil.pdf", payloadFor("application/pdf")),
    ).toThrow(/uploads/);
    expect(() =>
      buildUploadPolicy("../evil.pdf", payloadFor("application/pdf")),
    ).toThrow(/uploads/);
  });

  it("중첩 디렉터리 / 빈 파일명도 거부", () => {
    expect(() =>
      buildUploadPolicy("uploads/sub/evil.pdf", payloadFor("application/pdf")),
    ).toThrow(/filename/);
    expect(() =>
      buildUploadPolicy("uploads/", payloadFor("application/pdf")),
    ).toThrow(/filename/);
  });

  it("인코딩된 path separator(%2F, %5C)도 거부 — 우회 차단", () => {
    expect(() =>
      buildUploadPolicy("uploads/a%2Fb.pdf", payloadFor("application/pdf")),
    ).toThrow(/encoded separators/);
    expect(() =>
      buildUploadPolicy("uploads/a%5Cb.pdf", payloadFor("application/pdf")),
    ).toThrow(/encoded separators/);
    // 대소문자 혼재도 동일 처리.
    expect(() =>
      buildUploadPolicy("uploads/a%2fb.pdf", payloadFor("application/pdf")),
    ).toThrow(/encoded separators/);
  });

  it("모든 정책 거부는 UploadPolicyError — route가 400으로 매핑", () => {
    expect(() =>
      buildUploadPolicy("reports/x.pdf", payloadFor("application/pdf")),
    ).toThrow(UploadPolicyError);
    expect(() => buildUploadPolicy("uploads/x.pdf", null)).toThrow(UploadPolicyError);
    expect(() =>
      buildUploadPolicy("uploads/x.exe", payloadFor("application/x-msdownload")),
    ).toThrow(UploadPolicyError);
  });

  it("허용되지 않은 MIME은 토큰 발급 거부", () => {
    expect(() =>
      buildUploadPolicy(
        "uploads/evil.exe",
        payloadFor("application/x-msdownload"),
      ),
    ).toThrow(/지원하지 않는/);
  });

  it("MIME 확장자 미스매치 차단 — PDF MIME으로 위장한 .exe", () => {
    // MIME은 PDF 주장 + 파일명 확장자는 .exe → isAllowedFileUpload 탈락
    expect(() =>
      buildUploadPolicy("uploads/evil.exe", payloadFor("application/pdf")),
    ).toThrow(/지원하지 않는/);
  });

  it("clientPayload 누락·비JSON은 거부", () => {
    expect(() => buildUploadPolicy("uploads/a.pdf", null)).toThrow(/clientPayload/);
    expect(() => buildUploadPolicy("uploads/a.pdf", "not-json")).toThrow(/clientPayload/);
    expect(() => buildUploadPolicy("uploads/a.pdf", "{}")).toThrow(/clientPayload/);
  });
});

describe("upload-policy · image allowlist (upload-server-cap-4mb / SVG 차단)", () => {
  it("ALLOWED_IMAGE은 SVG를 더 이상 포함하지 않는다 — sanitizer 없음", () => {
    expect(ALLOWED_IMAGE as readonly string[]).not.toContain("image/svg+xml");
  });

  it("SVG 페이로드는 이미지 토큰 발급 거부", () => {
    expect(() =>
      buildUploadPolicy("uploads/evil.svg", payloadFor("image/svg+xml")),
    ).toThrow(/지원하지 않는/);
  });

  it("MAX_SIZE은 4MB — Vercel 함수 본문 한도(4.5MB)와 정합", () => {
    // upload-server-cap-4mb: 4MB(=4*1024*1024). 50MB가 아니어야 한다.
    expect(MAX_SIZE).toBe(4 * 1024 * 1024);
    expect(MAX_SIZE).toBeLessThan(50 * 1024 * 1024);
  });
});
