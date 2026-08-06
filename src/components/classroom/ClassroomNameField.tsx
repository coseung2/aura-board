"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Inline classroom-name editor used by the section header.
 *
 * The pencil is chrome-free: the hit area stays 44px but no border or
 * background is drawn. Clicking it swaps the heading for a text input that
 * commits on Enter or blur and cancels on Escape.
 */

type Props = {
  name: string;
  renaming: boolean;
  error: string | null;
  onRename: (next: string) => void;
  actions?: ReactNode;
};

export function ClassroomNameField({
  name,
  renaming,
  error,
  onRename,
  actions,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    onRename(trimmed);
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="classroom-name-field">
        <input
          ref={inputRef}
          className="classroom-name-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          maxLength={100}
          aria-label="학급 이름"
          disabled={renaming}
        />
        {error ? (
          <p className="classroom-name-error" role="alert">
            이름 저장 실패: {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="classroom-name-field">
      <h1 className="classroom-section-title">{name}</h1>
      <button
        type="button"
        className="classroom-name-edit"
        onClick={() => setEditing(true)}
        title="학급 이름 수정"
        aria-label="학급 이름 수정"
      >
        <PencilIcon />
      </button>
      {actions}
      {error ? (
        <p className="classroom-name-error" role="alert">
          이름 저장 실패: {error}
        </p>
      ) : null}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
