// comment-area poll (2026-06-28): helper for POST/PATCH routes to normalize
// the card-level comment-area poll option count.
//
// rules:
//   - null            -> disabled (no options)
//   - 0 or 1          -> disabled (same as null). 0/1 are common "off"
//                       expressions, so absorb them.
//   - 2..6            -> enabled (exactly N options)
//   - else (negative, 7+, fraction, string, ...) -> 400
//
// the normalized value is what ends up in the response, so the client
// only needs to look at null vs 2..6.

export type NormalizeCommentVoteOptionCountResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export function normalizeCommentVoteOptionCount(
  value: unknown,
): NormalizeCommentVoteOptionCountResult {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return {
      ok: false,
      error: "commentVoteOptionCount must be an integer or null",
    };
  }
  if (value === 0 || value === 1) return { ok: true, value: null };
  if (value >= 2 && value <= 6) return { ok: true, value };
  return {
    ok: false,
    error: "commentVoteOptionCount must be null or between 2 and 6",
  };
}

export type NormalizeCommentVoteOptionLabelsResult =
  | { ok: true; value: string[] | null }
  | { ok: false; error: string };

function defaultCommentVoteLabel(index: number): string {
  return `${index + 1}번`;
}

export function normalizeCommentVoteOptionLabels(
  value: unknown,
  optionCount: number | null,
): NormalizeCommentVoteOptionLabelsResult {
  if (!optionCount || optionCount < 2) return { ok: true, value: null };

  if (value === undefined || value === null) {
    return {
      ok: true,
      value: Array.from({ length: optionCount }, (_, idx) =>
        defaultCommentVoteLabel(idx),
      ),
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: "commentVoteOptionLabels must be an array or null",
    };
  }
  if (value.length !== optionCount) {
    return {
      ok: false,
      error: "commentVoteOptionLabels length must match commentVoteOptionCount",
    };
  }

  const labels = value.map((label, idx) => {
    if (typeof label !== "string") return null;
    const trimmed = label.trim();
    if (!trimmed) return defaultCommentVoteLabel(idx);
    return trimmed.slice(0, 40);
  });
  if (labels.some((label) => label === null)) {
    return {
      ok: false,
      error: "commentVoteOptionLabels must contain strings",
    };
  }
  return { ok: true, value: labels as string[] };
}

export function resolveCommentVoteOptionLabels(
  value: unknown,
  optionCount: number,
): string[] {
  if (Array.isArray(value)) {
    const labels = value
      .slice(0, optionCount)
      .map((label, idx) =>
        typeof label === "string" && label.trim()
          ? label.trim().slice(0, 40)
          : defaultCommentVoteLabel(idx),
      );
    if (labels.length === optionCount) return labels;
  }
  return Array.from({ length: optionCount }, (_, idx) =>
    defaultCommentVoteLabel(idx),
  );
}
