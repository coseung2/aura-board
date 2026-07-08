"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";

type Props = {
  // ???? ?? ???. ???? @ ???? ?? ???? ????.
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
          data.detail ?? data.error ?? "?? ?? ? ??? ??????.",
        );
      }
      await signOut({ redirectTo: "/" });
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : "?? ?? ? ??? ??????.",
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
          <h2 className="docs-h2">?? ??</h2>
        </div>
        <p className="docs-p">
          ???? ??? ??? ?? ???? ????? ???? ??? ?
          ????.
        </p>
        <button
          type="button"
          className="settings-action-btn is-danger withdrawal-trigger-btn"
          onClick={() => setShowModal(true)}
        >
          ????
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
              <h3 className="modal-title">?? ????????</h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                disabled={busy}
                aria-label="??"
              />
            </div>
            <div className="modal-body">
              <p className="docs-p">
                ????? ??? <strong>{email}</strong> ? @ ???(
                <code className="docs-code">{expectedLocalPart}</code>)?
                ??? ?????.
              </p>
              <label className="withdrawal-confirm-field">
                <span className="withdrawal-confirm-label">
                  ??? @ ??? ??
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
                ??
              </button>
              <button
                type="button"
                className="modal-btn-submit"
                onClick={handleWithdraw}
                disabled={busy || !isConfirmed}
              >
                {busy ? "?? ?? ??" : "????"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
