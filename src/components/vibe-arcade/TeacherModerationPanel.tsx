"use client";

// 교사 모더레이션 패널 (Seed 13 Phase 3 follow-up, 2026-04-22).
// 코딩 교실 보드에서 교사가 학생 제출 프로젝트를 승인/거부하는 UI.
// 조회: /api/vibe/moderation?boardId=xxx&status=pending_review
// 처리: POST /api/vibe/moderation/:projectId  { action, note? }

import { useCallback, useEffect, useState } from "react";

type ModerationStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "flagged"
  | "hidden"
  | "draft";

type ModerationItem = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  tags: string;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  authorStudentId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  author: { name: string; number: number | null };
};

type CountsByStatus = Partial<Record<ModerationStatus, number>>;

type Props = {
  boardId: string;
  onClose: () => void;
  onChange?: () => void; // 카탈로그 refetch 트리거용
};

const STATUS_TABS: Array<{ key: ModerationStatus | "all"; label: string }> = [
  { key: "pending_review", label: "검토 대기" },
  { key: "approved", label: "승인됨" },
  { key: "rejected", label: "거부됨" },
  { key: "flagged", label: "신고됨" },
  { key: "hidden", label: "숨김" },
  { key: "all", label: "전체" },
];

export function TeacherModerationPanel({ boardId, onClose, onChange }: Props) {
  const [tab, setTab] = useState<ModerationStatus | "all">("pending_review");
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [counts, setCounts] = useState<CountsByStatus>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/vibe/moderation?boardId=${encodeURIComponent(boardId)}&status=${encodeURIComponent(tab)}&take=100`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        items: ModerationItem[];
        counts: CountsByStatus;
      };
      setItems(data.items);
      setCounts(data.counts);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [boardId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(projectId: string, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      note =
        window.prompt("거부 사유를 입력하세요 (학생에게 공개)") ?? undefined;
      if (!note) return; // 빈 사유 취소
    }
    setBusyId(projectId);
    try {
      const res = await fetch(`/api/vibe/moderation/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`실패: ${data.error ?? res.statusText}`);
      } else {
        await load();
        onChange?.();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="va-mod-modal">
        <div className="va-mod-modal-header">
          <h2 className="va-mod-modal-title">📝 코딩 교실 - 모더레이션</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <nav className="va-mod-tabs" role="tablist" aria-label="상태 탭">
          {STATUS_TABS.map((t) => {
            const c = t.key === "all" ? undefined : counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`va-mod-tab${tab === t.key ? " is-active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {typeof c === "number" && c > 0 && (
                  <span className="va-mod-tab-count">{c}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="va-mod-body">
          {err ? (
            <div className="va-mod-error" role="alert">
              불러오기 실패: {err}
              <button type="button" onClick={load}>
                재시도
              </button>
            </div>
          ) : loading ? (
            <div className="va-mod-loading">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="va-mod-empty">해당 상태의 프로젝트가 없어요.</div>
          ) : (
            <ul className="va-mod-list">
              {items.map((it) => (
                <li key={it.id} className="va-mod-item">
                  <div className="va-mod-item-thumb">
                    {it.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        width={120}
                        height={90}
                      />
                    ) : (
                      <div className="va-mod-item-thumb-fallback" aria-hidden />
                    )}
                  </div>
                  <div className="va-mod-item-meta">
                    <div className="va-mod-item-title">
                      {it.title}
                      {it.version > 1 && (
                        <span className="va-mod-item-ver"> v{it.version}</span>
                      )}
                    </div>
                    <div className="va-mod-item-sub">
                      {it.author.number ? `${it.author.number}번 ` : ""}
                      {it.author.name} ·{" "}
                      {new Date(it.createdAt).toLocaleDateString("ko-KR")}
                    </div>
                    {it.description && (
                      <p className="va-mod-item-desc">{it.description}</p>
                    )}
                    {it.moderationNote && (
                      <p className="va-mod-item-note">
                        사유: {it.moderationNote}
                      </p>
                    )}
                  </div>
                  <div className="va-mod-item-actions">
                    {it.moderationStatus !== "approved" && (
                      <button
                        type="button"
                        className="va-mod-btn is-approve"
                        onClick={() => act(it.id, "approve")}
                        disabled={busyId === it.id}
                      >
                        승인
                      </button>
                    )}
                    {it.moderationStatus !== "rejected" && (
                      <button
                        type="button"
                        className="va-mod-btn is-reject"
                        onClick={() => act(it.id, "reject")}
                        disabled={busyId === it.id}
                      >
                        거부
                      </button>
                    )}
                    <a
                      className="va-mod-btn is-ghost"
                      href={`/sandbox/vibe/${it.id}?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      미리보기 ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
