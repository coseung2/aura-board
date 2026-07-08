"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function TeacherWithdrawalSection() {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/me", {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(
          data.detail ?? data.error ?? "탈퇴 처리 중 오류가 발생했습니다.",
        );
      }
      await signOut({ redirectTo: "/" });
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : "탈퇴 처리 중 오류가 발생했습니다.",
      );
    }
  }

  return (
    <>
      <section id="withdrawal" className="docs-section settings-section">
        <div className="settings-section-header">
          <h2 className="docs-h2">계정 탈퇴</h2>
        </div>
        <p className="docs-p">
          탈퇴하면 내 학급, 학생, 보드, 카드, AI 평어 기록 등 모든 데이터가
          영구적으로 삭제되며 복구할 수 없습니다.
        </p>
        <button
          type="button"
          className="settings-action-btn is-danger withdrawal-trigger-btn"
          onClick={() => setShowModal(true)}
        >
          탈퇴하기
        </button>
      </section>

      {showModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setShowModal(false);
            }
          }}
        >
          <div className="add-card-modal">
            <div className="modal-header">
              <h3 className="modal-title">정말 탈퇴하시겠어요?</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={busy}
                aria-label="닫기"
              />
            </div>
            <div className="modal-body">
              <p className="docs-p docs-note withdrawal-warning">
                탈퇴 즉시 아래 데이터가 영구 삭제되며 복구가 불가능합니다.
              </p>
              <ul className="withdrawal-list">
                <li>내가 만든 모든 학급과 학생 정보</li>
                <li>학급 보드, 카드, 댓글, 좋아요 기록</li>
                <li>AI 평어, 채점/피드백 기록</li>
                <li>결제/구독 기록 및 청구 정보</li>
              </ul>
              {error && <p className="withdrawal-error">{error}</p>}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setShowModal(false)}
                disabled={busy}
              >
                취소
              </button>
              <button
                type="button"
                className="modal-btn-submit"
                onClick={handleWithdraw}
                disabled={busy}
              >
                {busy ? "탈퇴 처리 중…" : "탈퇴하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
