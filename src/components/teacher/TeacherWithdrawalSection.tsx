"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";

type Props = {
  // 로그인된 교사 이메일. 모달에서 @ 앞부분만 다시 입력받아 확인한다.
  email: string;
};

export function TeacherWithdrawalSection({ email }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  const expectedLocalPart = useMemo(
    () => (email ?? "").split("@")[0] ?? "",
    [email],
  );
  const isConfirmed = confirmInput.trim() === expectedLocalPart;

  async function handleWithdraw() {
    if (busy) return;
    if (!isConfirmed) return;
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

  function closeModal() {
    if (busy) return;
    setShowModal(false);
    setConfirmInput("");
    setError(null);
  }

  return (
    <>
      <section id="withdrawal" className="docs-section settings-section">
        <div className="settings-section-header">
          <h2 className="docs-h2">계정 탈퇴</h2>
        </div>
        <p className="docs-p">
          탈퇴하면 계정에 포함된 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
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
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="add-card-modal withdrawal-modal">
            <div className="modal-header">
              <h3 className="modal-title">정말 탈퇴하시겠어요?</h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                disabled={busy}
                aria-label="닫기"
              />
            </div>
            <div className="modal-body">
              <p className="docs-p">
                계속하려면 이메일 <strong>{email}</strong> 의 @ 앞부분(
                <code className="docs-code">{expectedLocalPart}</code>)을
                그대로 입력하세요.
              </p>
              <label className="withdrawal-confirm-field">
                <span className="withdrawal-confirm-label">
                  이메일 @ 앞부분 확인
                </span>
                <input
                  type="text"
                  className="withdrawal-confirm-input"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={expectedLocalPart}
                />
              </label>
              {error && <p className="withdrawal-error">{error}</p>}
            </div>
            <div className="modal-actions withdrawal-actions">
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={closeModal}
                disabled={busy}
              >
                취소
              </button>
              <button
                type="button"
                className="modal-btn-submit"
                onClick={handleWithdraw}
                disabled={busy || !isConfirmed}
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
