// UGC safety core (App Store guideline 1.2, 2026-07-25).
//
// Pure helpers only, so the visibility rules can be unit-tested without a
// database. Route handlers own the queries; this module owns the decisions.

export const CONTENT_TARGET_KINDS = ["card", "comment"] as const;
export type ContentTargetKind = (typeof CONTENT_TARGET_KINDS)[number];

export const CONTENT_REPORT_REASONS = [
  "profanity",
  "harassment",
  "personal_info",
  "other",
] as const;
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

/** Student-facing reason copy. Kept here so mobile and web stay in sync. */
export const CONTENT_REPORT_REASON_LABELS: Record<ContentReportReason, string> = {
  profanity: "욕설이나 나쁜 말이 있어요",
  harassment: "저를 괴롭히는 내용이에요",
  personal_info: "개인정보가 들어있어요",
  other: "그밖에 적절하지 않아요",
};

/** Only `other` accepts free text; everything else ignores the detail field. */
export const REPORT_DETAIL_MAX_LENGTH = 200;

/** Reported text kept for the teacher queue, so deletion does not lose context. */
export const REPORT_SNAPSHOT_MAX_LENGTH = 500;

export function reasonAcceptsDetail(reason: ContentReportReason): boolean {
  return reason === "other";
}

/**
 * Normalize the optional free-text detail. Returns null unless the reason is
 * `other` and the student actually typed something.
 */
export function normalizeReportDetail(
  reason: ContentReportReason,
  detail: string | null | undefined,
): string | null {
  if (!reasonAcceptsDetail(reason)) return null;
  const trimmed = (detail ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, REPORT_DETAIL_MAX_LENGTH);
}

/** Truncate the reported content for storage in the report row. */
export function buildContentSnapshot(content: string | null | undefined): string | null {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, REPORT_SNAPSHOT_MAX_LENGTH);
}

export interface HiddenTargetRef {
  targetKind: ContentTargetKind;
  targetId: string;
}

/**
 * Per-student hide state for one screen.
 *
 * `hiddenAuthorStudentIds` is the author-level ("block") set. It is empty for
 * most students because that path is only offered after filing a report.
 */
export interface HiddenState {
  hiddenTargets: readonly HiddenTargetRef[];
  hiddenAuthorStudentIds: readonly string[];
}

export interface HiddenLookup {
  isTargetHidden(kind: ContentTargetKind, targetId: string): boolean;
  isAuthorHidden(studentId: string | null | undefined): boolean;
  readonly hasAnyHide: boolean;
}

/** Build an O(1) lookup from the rows loaded for the current student. */
export function buildHiddenLookup(state: HiddenState): HiddenLookup {
  const targets = new Set(
    state.hiddenTargets.map((ref) => hiddenTargetKey(ref.targetKind, ref.targetId)),
  );
  const authors = new Set(state.hiddenAuthorStudentIds);
  return {
    isTargetHidden: (kind, targetId) => targets.has(hiddenTargetKey(kind, targetId)),
    isAuthorHidden: (studentId) => (studentId ? authors.has(studentId) : false),
    hasAnyHide: targets.size > 0 || authors.size > 0,
  };
}

export function hiddenTargetKey(kind: ContentTargetKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

/**
 * Hide reason for a single item, or null when it stays fully visible.
 *
 * `item` means the student hid this one thing; `author` means every item from
 * that peer is hidden. The distinction drives different UI copy: an item hide
 * offers an inline undo, an author hide points at the settings screen.
 */
export type HiddenReason = "item" | "author";

export function resolveHiddenReason(
  lookup: HiddenLookup,
  kind: ContentTargetKind,
  targetId: string,
  authorStudentId: string | null | undefined,
): HiddenReason | null {
  if (lookup.isTargetHidden(kind, targetId)) return "item";
  if (lookup.isAuthorHidden(authorStudentId)) return "author";
  return null;
}

/**
 * A student may report and hide anything except their own writing. Hiding your
 * own card would silently break the author's view of their board.
 */
export function canActOnContent(
  actorStudentId: string,
  authorStudentId: string | null | undefined,
): boolean {
  return authorStudentId !== actorStudentId;
}
