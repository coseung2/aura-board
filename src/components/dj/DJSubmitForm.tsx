"use client";

import { useState } from "react";

type Props = {
  error: string | null;
  onSubmit: (youtubeUrl: string) => boolean | Promise<boolean>;
};

/**
 * 신청곡 인라인 카드.
 * 핸드오프 디자인(DJBoardPage.jsx)에 맞춰 모달 → 사이드 aside 상시 노출로 전환.
 * onClose / backdrop 제거됨 — 부모가 언제 렌더할지 결정.
 */
export function DJSubmitForm({ error, onSubmit }: Props) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    setSubmitted(false);
    try {
      const ok = await onSubmit(url.trim());
      if (ok) {
        setUrl("");
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="dj-submit-card" onSubmit={handle}>
      <h3 className="dj-submit-title">신청곡 추가</h3>
      <input
        type="text"
        className="dj-submit-input"
        placeholder="YouTube 링크 또는 곡 제목"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          if (submitted) setSubmitted(false);
        }}
        disabled={submitting}
      />
      <button
        type="submit"
        className="dj-submit-btn"
        disabled={!url.trim() || submitting}
      >
        {submitting ? "신청 중…" : "신청하기"}
      </button>
      {error ? (
        <p className="dj-submit-error">{error}</p>
      ) : submitted ? (
        <p className="dj-submit-success">
          신청 완료! 대기열에 등록됐어요. 선생님 승인 전에는 대기 상태로 보여요.
        </p>
      ) : (
        <p className="dj-submit-note">
          학생 신청은 대기 상태로 등록되고, 교사 승인 후 재생 목록에 올라갑니다.
        </p>
      )}
    </form>
  );
}
