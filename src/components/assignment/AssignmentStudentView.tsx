"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentSlotDTO } from "@/types/assignment";
import { ReturnReasonBanner } from "./ReturnReasonBanner";
import { formatDeadlineKst } from "./AssignmentDeadlineForm";

type Props = {
  slot: AssignmentSlotDTO | null;
  guideText: string;
  canSubmit: boolean;
  boardDeadline?: string | null;
  assignmentAllowLate?: boolean;
};

type SubmissionResponse = {
  submission?: {
    submittedAt?: string;
    submittedOnTime?: boolean;
    rewardEligible?: boolean;
    rewardAwarded?: boolean;
    rewardAmount?: number;
    idempotent?: boolean;
  };
};

function createIdempotencyKey() {
  const cryptoApi = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

export function AssignmentStudentView({
  slot,
  guideText,
  canSubmit,
  boardDeadline,
  assignmentAllowLate = true,
}: Props) {
  const router = useRouter();
  const [content, setContent] = useState(slot?.card.content ?? "");
  const [linkUrl, setLinkUrl] = useState(slot?.card.linkUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [slot?.id]);

  if (!slot) {
    return (
      <div className="assign-student assign-student--empty">
        <p>배정된 과제가 없습니다.</p>
      </div>
    );
  }

  async function handleSubmit() {
    if (!slot) return;
    setError(null);
    setSuccessMessage(null);
    setBusy(true);
    const idempotencyKey = idempotencyKeyRef.current ?? createIdempotencyKey();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const res = await fetch(`/api/assignment-slots/${slot.id}/submission`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: content || undefined,
          linkUrl: linkUrl || undefined,
          idempotencyKey,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as SubmissionResponse & {
        error?: string;
      };
      if (!res.ok) {
        setError(body?.error ?? "submission_failed");
        // The server answered, so this was not a network retry. A future
        // intentional submission should receive a fresh key.
        idempotencyKeyRef.current = null;
      } else {
        const result = body.submission;
        if (result?.submittedOnTime === false) {
          setSuccessMessage("늦게 제출했어요. 제출은 저장되지만 보상은 없어요.");
        } else if (result?.rewardAwarded && (result.rewardAmount ?? 0) > 0) {
          setSuccessMessage(`기한 내 제출 보상 +${result.rewardAmount}원`);
        } else if (result?.submittedOnTime) {
          setSuccessMessage("기한 내 제출했어요.");
        } else {
          setSuccessMessage("제출했어요.");
        }
        idempotencyKeyRef.current = null;
        router.refresh();
      }
    } catch (err) {
      // Keep the key so a user retry after a dropped connection replays the
      // same attempt instead of creating a duplicate reward/submission.
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  const isReturned = slot.submissionStatus === "returned";
  const isSubmitted =
    slot.submissionStatus === "submitted" ||
    slot.submissionStatus === "viewed" ||
    slot.submissionStatus === "reviewed";
  const dueAt = slot.dueAt ?? boardDeadline ?? null;
  const deadlineLabel = formatDeadlineKst(dueAt);
  const deadlinePassed = dueAt ? new Date(dueAt).getTime() < now : false;
  const gradingLocked = slot.gradingStatus === "graded" || slot.gradingStatus === "released";
  const deadlineState = gradingLocked
    ? "제출 잠김"
    : deadlinePassed
      ? "기한 지남"
      : "제출 가능";

  return (
    <div className="assign-student">
      {isReturned && slot.returnReason && (
        <ReturnReasonBanner reason={slot.returnReason} />
      )}
      {guideText && (
        <section className="assign-guide" aria-labelledby="assign-guide-label">
          <div id="assign-guide-label" className="assign-guide__label">
            안내
          </div>
          <div className="assign-guide__body">{guideText}</div>
        </section>
      )}

      {deadlineLabel ? (
        <section
          className={`assign-deadline-status${deadlinePassed ? " is-overdue" : ""}`}
          aria-label="제출 기한"
        >
          <div>
            <span className="assign-deadline-status__label">제출 기한</span>
            <strong>{deadlineLabel} KST</strong>
          </div>
          <span className="assign-deadline-status__state">{deadlineState}</span>
          {gradingLocked ? (
            <p>채점이 완료되어 수정할 수 없습니다.</p>
          ) : deadlinePassed && !isSubmitted ? (
            <p>
              {assignmentAllowLate
                ? "늦은 제출은 저장될 수 있지만 보상은 없어요."
                : "마감이 지나 제출할 수 없습니다."}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="assign-submit-card">
        {isSubmitted && !isReturned && (
          <p className="assign-submit-status">
            <span className="ds-pill">제출됨</span>
            <span>
              {slot.submittedOnTime === false
                ? "늦게 제출됨 · 보상 없음"
                : slot.submittedOnTime
                  ? "기한 내 제출됨 · +20원 대상"
                  : "선생님이 확인합니다."}
            </span>
          </p>
        )}
        {successMessage ? (
          <p className="assign-submit-card__success" role="status">
            {successMessage}
          </p>
        ) : null}
        <label className="assign-submit-card__label" htmlFor="assign-content">
          제출 내용
        </label>
        <textarea
          id="assign-content"
          className="assign-submit-card__textarea"
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={!canSubmit || busy}
          placeholder="제출할 내용을 입력하세요."
        />
        <label className="assign-submit-card__label" htmlFor="assign-link">
          링크(선택)
        </label>
        <input
          id="assign-link"
          type="url"
          className="assign-submit-card__input"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          disabled={!canSubmit || busy}
          placeholder="https://..."
        />
        {error && <div className="assign-submit-card__error">제출 실패: {error}</div>}
        <div className="assign-submit-card__actions">
          <button
            type="button"
            className="assign-btn assign-btn--primary"
            disabled={!canSubmit || busy}
            onClick={handleSubmit}
            aria-disabled={!canSubmit}
          >
            {isSubmitted ? "다시 제출하기" : isReturned ? "재제출하기" : "제출하기"}
          </button>
          {!canSubmit && (
            <span className="assign-submit-card__note">
              {slot.gradingStatus === "graded" || slot.gradingStatus === "released"
                ? "채점이 완료되어 수정할 수 없습니다."
                : deadlinePassed && !assignmentAllowLate
                  ? "마감이 지나 제출할 수 없습니다."
                  : "지금은 제출할 수 없습니다."}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
