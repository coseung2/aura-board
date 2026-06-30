"use client";

import { useState } from "react";
import { notifyClassroomListChanged } from "@/lib/client-lookup-cache";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateClassroomModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setBusy(true);
    try {
      const res = await fetch("/api/classroom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        notifyClassroomListChanged();
        onCreated();
      } else {
        alert(`학급 생성 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal create-classroom-modal">
        <div className="modal-header">
          <h2 className="modal-title">새 학급 만들기</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="modal-field-label">학급 이름</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 3학년 2반"
            className="modal-input"
            maxLength={100}
            required
          />

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="modal-btn-cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="modal-btn-submit"
            >
              {busy ? "생성 중..." : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
