"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

type Props = {
  email: string;
  initialName: string;
};

function defaultNickname(email: string, name: string) {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return (email ?? "").split("@")[0] ?? "";
}

export function TeacherWithdrawalSection({ email, initialName }: Props) {
  const { update } = useSession();
  const [name, setName] = useState(() => defaultNickname(email, initialName));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const expectedLocalPart = useMemo(
    () => (email ?? "").split("@")[0] ?? "",
    [email],
  );
  const isConfirmed = confirmInput.trim() === expectedLocalPart;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function saveName(next: string) {
    const trimmed = next.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      const res = await fetch("/api/teacher/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: { name?: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.user?.name) {
        throw new Error(data.error ?? "닉네임을 저장하지 못했습니다.");
      }
      setName(data.user.name);
      setDraft(data.user.name);
      await update({ name: data.user.name });
    } catch (err) {
      setDraft(name);
      setRenameError(
        err instanceof Error ? err.message : "닉네임을 저장하지 못했습니다.",
      );
    } finally {
      setRenameBusy(false);
    }
  }

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
      <section
        id="account"
        className="ai-settings-group settings-account-section"
        aria-labelledby="account-heading"
      >
        <div className="ai-settings-group-head ai-provider-table-head">
          <div>
            <h3 id="account-heading">계정관리</h3>
          </div>
          <div className="ai-provider-table-labels" aria-hidden="true">
            <span>닉네임</span>
            <span>관리</span>
          </div>
        </div>
        <div className="ai-settings-group-body">
          <div className="ai-provider-table" role="table" aria-label="계정관리">
            <div className="ai-provider-table-row" role="row">
              <div className="ai-provider-table-provider" role="cell">
                <strong>{email}</strong>
              </div>
              <div className="ai-provider-table-connection" role="cell">
                {editing ? (
                  <input
                    ref={inputRef}
                    className="teacher-nickname-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => void saveName(draft)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveName(draft);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setDraft(name);
                        setEditing(false);
                      }
                    }}
                    maxLength={40}
                    disabled={renameBusy}
                    aria-label="닉네임"
                  />
                ) : (
                  <div className="teacher-nickname-display">
                    <span>{name || expectedLocalPart}</span>
                    <button
                      type="button"
                      className="teacher-nickname-edit"
                      onClick={() => setEditing(true)}
                      title="닉네임 수정"
                      aria-label="닉네임 수정"
                    >
                      <PencilIcon />
                    </button>
                  </div>
                )}
              </div>
              <div className="ai-provider-table-billing" role="cell">
                <button
                  type="button"
                  className="settings-action-btn is-danger withdrawal-trigger-btn"
                  onClick={() => setShowModal(true)}
                >
                  탈퇴하기
                </button>
              </div>
            </div>
            {renameError ? (
              <p className="ai-settings-inline-error" role="alert">
                {renameError}
              </p>
            ) : null}
          </div>
        </div>
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.99-1.66z"
        fill="currentColor"
      />
    </svg>
  );
}
