// Student-facing UGC safety client (App Store guideline 1.2, 2026-07-25).
//
// Mirrors src/lib/content-safety.ts. Kept as a separate file because the mobile
// app does not import from the Next.js app's module graph.

import { apiFetch } from "./api";

export const CONTENT_REPORT_REASONS = [
  "profanity",
  "harassment",
  "personal_info",
  "other",
] as const;

export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

export type ContentTargetKind = "card" | "comment" | "feed_post" | "feed_comment";

/** Why an item is hidden. `item` is undoable inline; `author` is not. */
export type HiddenReason = "item" | "author";

export const CONTENT_REPORT_REASON_LABELS: Record<ContentReportReason, string> = {
  profanity: "욕설이나 나쁜 말이 있어요",
  harassment: "저를 괴롭히는 내용이에요",
  personal_info: "개인정보가 들어있어요",
  other: "그밖에 적절하지 않아요",
};

export const REPORT_DETAIL_MAX_LENGTH = 200;

export function reasonAcceptsDetail(reason: ContentReportReason): boolean {
  return reason === "other";
}

/** Placeholder copy shown where a hidden item used to be. */
export function hiddenPlaceholderText(kind: ContentTargetKind, reason: HiddenReason): string {
  const noun = kind === "comment" || kind === "feed_comment" ? "댓글" : "게시글";
  if (reason === "author") return `숨긴 친구의 ${noun}이에요`;
  return `내가 숨긴 ${noun}이에요`;
}

export interface ReportResult {
  reportId: string;
  hiddenAuthor: boolean;
  authorStudentId: string | null;
  authorLabel: string | null;
}

/**
 * File a report. The server also hides the item for the reporter, so callers
 * should mark it hidden locally without a second request.
 */
export async function reportContent(input: {
  targetKind: ContentTargetKind;
  targetId: string;
  reason: ContentReportReason;
  detail?: string;
  hideAuthor?: boolean;
}): Promise<ReportResult> {
  const response = await apiFetch<{
    reportId: string;
    hiddenAuthor?: boolean;
    authorStudentId?: string | null;
    authorLabel?: string | null;
  }>("/api/student/content-reports", { method: "POST", json: input });
  return {
    reportId: response.reportId,
    hiddenAuthor: Boolean(response.hiddenAuthor),
    authorStudentId: response.authorStudentId ?? null,
    authorLabel: response.authorLabel ?? null,
  };
}

export async function hideContent(input: {
  targetKind: ContentTargetKind;
  targetId: string;
}): Promise<void> {
  await apiFetch("/api/student/hidden-content", { method: "POST", json: input });
}

export async function unhideContent(input: {
  targetKind: ContentTargetKind;
  targetId: string;
}): Promise<void> {
  await apiFetch("/api/student/hidden-content", {
    method: "DELETE",
    json: { scope: "target", ...input },
  });
}

export async function unhideAuthor(hiddenStudentId: string): Promise<void> {
  await apiFetch("/api/student/hidden-content", {
    method: "DELETE",
    json: { scope: "author", hiddenStudentId },
  });
}

export async function blockAuthor(hiddenStudentId: string): Promise<void> {
  await apiFetch("/api/student/hidden-content", {
    method: "POST",
    json: { scope: "author", hiddenStudentId },
  });
}

export interface HiddenContentSummary {
  items: Array<{
    targetKind: ContentTargetKind;
    targetId: string;
    viaReport: boolean;
    createdAt: string;
  }>;
  authors: Array<{ studentId: string; name: string; createdAt: string }>;
}

export async function loadHiddenContent(): Promise<HiddenContentSummary> {
  const response = await apiFetch<Partial<HiddenContentSummary>>(
    "/api/student/hidden-content",
  );
  return { items: response.items ?? [], authors: response.authors ?? [] };
}
