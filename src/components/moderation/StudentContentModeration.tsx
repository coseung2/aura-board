"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CONTENT_REPORT_REASON_LABELS,
  CONTENT_REPORT_REASONS,
  REPORT_DETAIL_MAX_LENGTH,
  type ContentReportReason,
} from "@/lib/content-safety";

export type ContentTargetKind = "card" | "comment";
export type HiddenReason = "item" | "author";

export const STUDENT_CONTENT_HIDDEN_EVENT = "aura:student-content-hidden";

type HiddenEventDetail = {
  targetKind: ContentTargetKind;
  targetId: string;
  hiddenReason: HiddenReason;
  hiddenStudentId?: string | null;
};

export function dispatchStudentContentHidden(detail: HiddenEventDetail) {
  window.dispatchEvent(
    new CustomEvent<HiddenEventDetail>(STUDENT_CONTENT_HIDDEN_EVENT, {
      detail,
    }),
  );
}

export function useStudentContentHidden(
  targetKind: ContentTargetKind,
  targetId: string,
  initialReason: HiddenReason | null = null,
  authorStudentId?: string | null,
) {
  type HiddenValue = {
    reason: HiddenReason;
    hiddenStudentId?: string | null;
  } | null;
  const [override, setOverride] = useState<{
    targetId: string;
    value: HiddenValue;
  } | null>(null);
  const hidden =
    override?.targetId === targetId
      ? override.value
      : initialReason
        ? { reason: initialReason }
        : null;
  const setHidden = (value: HiddenValue) => setOverride({ targetId, value });

  useEffect(() => {
    const onHidden = (event: Event) => {
      const detail = (event as CustomEvent<HiddenEventDetail>).detail;
      const matchesTarget =
        detail.targetKind === targetKind && detail.targetId === targetId;
      const matchesAuthor = Boolean(
        detail.hiddenReason === "author" &&
        detail.hiddenStudentId &&
        authorStudentId &&
        detail.hiddenStudentId === authorStudentId,
      );
      if (!matchesTarget && !matchesAuthor) return;
      setOverride({
        targetId,
        value: {
          reason: detail.hiddenReason,
          hiddenStudentId: detail.hiddenStudentId,
        },
      });
    };
    window.addEventListener(STUDENT_CONTENT_HIDDEN_EVENT, onHidden);
    return () =>
      window.removeEventListener(STUDENT_CONTENT_HIDDEN_EVENT, onHidden);
  }, [authorStudentId, targetId, targetKind]);

  return { hidden, setHidden };
}

export function HiddenContentPlaceholder({
  targetKind,
  targetId,
  reason,
  hiddenStudentId,
  onRestored,
}: {
  targetKind: ContentTargetKind;
  targetId: string;
  reason: HiddenReason;
  hiddenStudentId?: string | null;
  onRestored?: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRestoreHere = reason === "item" || Boolean(hiddenStudentId);

  const restore = async () => {
    if (!canRestoreHere || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const body =
        reason === "author"
          ? { scope: "author", hiddenStudentId }
          : { scope: "target", targetKind, targetId };
      const response = await fetch("/api/student/hidden-content", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("restore_failed");
      onRestored?.();
    } catch {
      setError("복원하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="student-hidden-placeholder" role="status">
      <strong>{targetKind === "card" ? "숨긴 카드" : "숨긴 댓글"}</strong>
      <span>
        {reason === "author"
          ? "숨긴 작성자의 콘텐츠예요."
          : "내 화면에서 숨긴 콘텐츠예요."}
      </span>
      <div className="student-hidden-placeholder-actions">
        {canRestoreHere ? (
          <button type="button" onClick={restore} disabled={restoring}>
            {restoring ? "복원 중..." : "되돌리기"}
          </button>
        ) : (
          <Link href="/student/hidden-content">숨긴 콘텐츠 관리</Link>
        )}
      </div>
      {error && <span className="student-moderation-error">{error}</span>}
    </div>
  );
}

export function StudentContentModerationControls({
  targetKind,
  targetId,
  authorStudentId,
  onHidden,
}: {
  targetKind: ContentTargetKind;
  targetId: string;
  authorStudentId?: string | null;
  onHidden?: (reason: HiddenReason, hiddenStudentId?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<ContentReportReason>("profanity");
  const [detail, setDetail] = useState("");
  const [hideAuthor, setHideAuthor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishHidden = (
    hiddenReason: HiddenReason,
    hiddenStudentId?: string | null,
  ) => {
    dispatchStudentContentHidden({
      targetKind,
      targetId,
      hiddenReason,
      hiddenStudentId,
    });
    onHidden?.(hiddenReason, hiddenStudentId);
    setOpen(false);
  };

  const hide = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/student/hidden-content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetKind, targetId }),
      });
      if (!response.ok) throw new Error("hide_failed");
      finishHidden("item");
    } catch {
      setError("숨기지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const report = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/student/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetKind,
          targetId,
          reason,
          detail: reason === "other" ? detail.trim() || undefined : undefined,
          hideAuthor,
        }),
      });
      if (!response.ok) throw new Error("report_failed");
      const result = (await response.json()) as {
        hiddenAuthor?: boolean;
        authorStudentId?: string | null;
      };
      finishHidden(
        result.hiddenAuthor ? "author" : "item",
        result.authorStudentId ?? authorStudentId,
      );
    } catch {
      setError("신고하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="student-moderation-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={`${targetKind === "card" ? "카드" : "댓글"} 신고 또는 숨기기`}
        title="신고 또는 숨기기"
      >
        •••
      </button>
      {open &&
        createPortal(
          <div
            className="student-moderation-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`student-moderation-title-${targetKind}-${targetId}`}
            onClick={(event) => {
              if (event.target === event.currentTarget && !busy) setOpen(false);
            }}
          >
            <div className="student-moderation-dialog">
              <div className="student-moderation-head">
                <h2 id={`student-moderation-title-${targetKind}-${targetId}`}>
                  {reporting ? "콘텐츠 신고" : "콘텐츠 관리"}
                </h2>
                <button
                  type="button"
                  className="ui-icon-action"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              {reporting ? (
                <form className="student-moderation-form" onSubmit={report}>
                  <label>
                    신고 이유
                    <select
                      value={reason}
                      onChange={(event) =>
                        setReason(event.target.value as ContentReportReason)
                      }
                    >
                      {CONTENT_REPORT_REASONS.map((option) => (
                        <option key={option} value={option}>
                          {CONTENT_REPORT_REASON_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {reason === "other" && (
                    <label>
                      자세한 내용 <span>(선택)</span>
                      <textarea
                        value={detail}
                        onChange={(event) => setDetail(event.target.value)}
                        maxLength={REPORT_DETAIL_MAX_LENGTH}
                        rows={3}
                      />
                    </label>
                  )}
                  {authorStudentId && (
                    <label className="student-moderation-check">
                      <input
                        type="checkbox"
                        checked={hideAuthor}
                        onChange={(event) =>
                          setHideAuthor(event.target.checked)
                        }
                      />
                      이 작성자의 다른 콘텐츠도 숨기기
                    </label>
                  )}
                  {error && <p className="student-moderation-error">{error}</p>}
                  <div className="student-moderation-dialog-actions">
                    <button
                      type="button"
                      onClick={() => setReporting(false)}
                      disabled={busy}
                    >
                      이전
                    </button>
                    <button type="submit" className="is-danger" disabled={busy}>
                      {busy ? "신고 중..." : "신고하고 숨기기"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="student-moderation-menu">
                  <p>이 콘텐츠는 내 화면에서만 숨겨져요.</p>
                  {error && <p className="student-moderation-error">{error}</p>}
                  <button type="button" onClick={hide} disabled={busy}>
                    {busy ? "숨기는 중..." : "숨기기"}
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => setReporting(true)}
                  >
                    신고하기
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
