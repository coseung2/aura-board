"use client";

import { useEffect, useId, useState } from "react";
import { SidePanel } from "./ui/SidePanel";

export type SectionForPanel = {
  id: string;
  title: string;
};

type Tab = "rename" | "delete";

type Props = {
  open: boolean;
  onClose: () => void;
  section: SectionForPanel;
  currentRole: "owner" | "editor" | "viewer";
  defaultTab?: Tab;
  onRenamed: (newTitle: string) => void;
  onDeleted: () => void;
};

export function SectionActionsPanel({
  open,
  onClose,
  section,
  currentRole,
  defaultTab = "rename",
  onRenamed,
  onDeleted,
}: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const tablistId = useId();

  // Reset tab whenever the panel opens for a different section / default.
  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab, section.id]);

  const canEdit = currentRole === "owner" || currentRole === "editor";

  return (
    <SidePanel open={open} onClose={onClose} title={`${section.title} 옵션`}>
      <div
        role="tablist"
        aria-label="섹션 옵션"
        className="side-panel-tabs"
        id={tablistId}
        style={{ margin: "-16px -20px 16px" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rename"}
          aria-controls={`${tablistId}-panel-rename`}
          id={`${tablistId}-tab-rename`}
          className="side-panel-tab"
          onClick={() => setTab("rename")}
          disabled={!canEdit}
        >
          이름 변경
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "delete"}
          aria-controls={`${tablistId}-panel-delete`}
          id={`${tablistId}-tab-delete`}
          className="side-panel-tab danger"
          onClick={() => setTab("delete")}
          disabled={!canEdit}
        >
          삭제
        </button>
      </div>

      {tab === "rename" && canEdit && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-rename`}
          aria-labelledby={`${tablistId}-tab-rename`}
        >
          <SectionRenameForm
            sectionId={section.id}
            initialTitle={section.title}
            onRenamed={(t) => {
              onRenamed(t);
            }}
          />
        </div>
      )}

      {tab === "delete" && canEdit && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-delete`}
          aria-labelledby={`${tablistId}-tab-delete`}
        >
          <SectionDeleteForm
            sectionId={section.id}
            onDeleted={() => {
              onDeleted();
            }}
          />
        </div>
      )}
    </SidePanel>
  );
}

/* ── Rename form ──────────────────────────────────────── */

function SectionRenameForm({
  sectionId,
  initialTitle,
  onRenamed,
}: {
  sectionId: string;
  initialTitle: string;
  onRenamed: (newTitle: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || trimmed === initialTitle) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        setStatus(`저장 실패: ${err || res.status}`);
        return;
      }
      onRenamed(trimmed);
      setStatus("저장됨 ✓");
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="section-rename-form" onSubmit={handleSubmit}>
      <label htmlFor={`rename-${sectionId}`}>섹션 이름</label>
      <input
        id={`rename-${sectionId}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
        required
        autoFocus
      />
      <p className="share-status" aria-live="polite">
        {status}
      </p>
      <div className="actions">
        <button
          type="submit"
          disabled={busy || !title.trim() || title.trim() === initialTitle}
        >
          {busy ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}

/* ── Delete form ──────────────────────────────────────── */

function SectionDeleteForm({
  sectionId,
  onDeleted,
}: {
  sectionId: string;
  onDeleted: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const descId = useId();

  async function handleDelete() {
    if (!confirmed || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        setStatus(`삭제 실패: ${err || res.status}`);
        return;
      }
      onDeleted();
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-delete-confirm">
      <p id={descId}>
        이 섹션을 삭제합니다. 섹션에 있던 카드도 함께 삭제됩니다.
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        삭제한다는 것을 이해했어요
      </label>
      <p className="share-status" aria-live="polite">
        {status}
      </p>
      <button
        type="button"
        className="section-delete-btn"
        onClick={handleDelete}
        disabled={!confirmed || busy}
        aria-describedby={descId}
      >
        {busy ? "삭제 중..." : "섹션 삭제"}
      </button>
    </div>
  );
}
