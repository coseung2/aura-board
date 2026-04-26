"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatRelativeTime } from "@/lib/card-engagement-format";

// card-comments-likes (2026-04-26): 카드별 좋아요 + 댓글 UI.
// mode="chips"  — 인라인 보드 카드 footer (좋아요 토글 + 댓글 카운트
//                  → 클릭 시 내부 모달 열어 댓글 패널 노출).
// mode="panel"  — PortfolioCardModal/showcase 등 이미 모달 안인 컨텍스트.
//                  댓글 패널을 통째로 인라인 렌더.

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  authorKind: "teacher" | "student";
  authorLabel: string;
  canDelete: boolean;
}

interface EngagementState {
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  canInteract: boolean;
}

interface Props {
  cardId: string;
  mode: "chips" | "panel";
}

export function CardEngagement({ cardId, mode }: Props) {
  const [state, setState] = useState<EngagementState | null>(null);
  const [showModal, setShowModal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/cards/${cardId}/engagement`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as EngagementState;
      setState(j);
    } catch {
      /* ignore transient */
    }
  }, [cardId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleLike = useCallback(async () => {
    if (!state?.canInteract) return;
    // optimistic
    setState((s) =>
      s
        ? { ...s, isLiked: !s.isLiked, likeCount: s.likeCount + (s.isLiked ? -1 : 1) }
        : s
    );
    try {
      const r = await fetch(`/api/cards/${cardId}/like`, { method: "POST" });
      if (!r.ok) {
        await refresh();
        return;
      }
      const j = (await r.json()) as { liked: boolean; count: number };
      setState((s) => (s ? { ...s, isLiked: j.liked, likeCount: j.count } : s));
    } catch {
      await refresh();
    }
  }, [cardId, refresh, state?.canInteract]);

  if (!state) {
    return mode === "chips" ? (
      <div className="card-engagement-chips" aria-hidden>
        <span className="card-engagement-chip card-engagement-chip-loading">…</span>
      </div>
    ) : null;
  }

  if (mode === "chips") {
    return (
      <>
        <div className="card-engagement-chips" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`card-engagement-chip card-engagement-like${state.isLiked ? " is-liked" : ""}`}
            onClick={toggleLike}
            disabled={!state.canInteract}
            aria-pressed={state.isLiked}
            aria-label={state.isLiked ? "좋아요 취소" : "좋아요"}
            title={state.canInteract ? "" : "학부모는 좋아요를 누를 수 없어요"}
          >
            <span aria-hidden>{state.isLiked ? "❤️" : "🤍"}</span>
            <span>{state.likeCount}</span>
          </button>
          <button
            type="button"
            className="card-engagement-chip card-engagement-comment"
            onClick={() => setShowModal(true)}
            aria-label={`댓글 ${state.commentCount}개 보기`}
          >
            <span aria-hidden>💬</span>
            <span>{state.commentCount}</span>
          </button>
        </div>
        {showModal && (
          <CommentsModal cardId={cardId} canInteract={state.canInteract} onClose={() => {
            setShowModal(false);
            void refresh();
          }} />
        )}
      </>
    );
  }

  // panel mode — 인라인 풀 패널
  return (
    <div className="card-engagement-panel">
      <div className="card-engagement-panel-likeRow">
        <button
          type="button"
          className={`card-engagement-like-btn${state.isLiked ? " is-liked" : ""}`}
          onClick={toggleLike}
          disabled={!state.canInteract}
          aria-pressed={state.isLiked}
          title={state.canInteract ? "" : "학부모는 좋아요를 누를 수 없어요"}
        >
          <span aria-hidden>{state.isLiked ? "❤️" : "🤍"}</span>
          <span>좋아요 {state.likeCount}</span>
        </button>
        <span className="card-engagement-meta">댓글 {state.commentCount}</span>
      </div>
      <CommentsBlock cardId={cardId} canInteract={state.canInteract} onChange={refresh} />
    </div>
  );
}

function CommentsModal({
  cardId,
  canInteract,
  onClose,
}: {
  cardId: string;
  canInteract: boolean;
  onClose: () => void;
}) {
  // engagement-modal-portal (2026-04-26): 모달이 카드 DOM 안에 그대로 있으면
  // 부모 .portfolio-card-link / .showcase-chip 의 pointer-events:none 가
  // 모달의 닫기·제출 버튼까지 막아서 안 눌림. portal 로 document.body 에 옮겨
  // DOM 계층 탈출.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const node = (
    <div
      className="card-engagement-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="댓글"
    >
      <div className="card-engagement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-engagement-modal-head">
          <h3>댓글</h3>
          <button
            type="button"
            className="card-engagement-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="card-engagement-modal-body">
          <CommentsBlock cardId={cardId} canInteract={canInteract} />
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function CommentsBlock({
  cardId,
  canInteract,
  onChange,
}: {
  cardId: string;
  canInteract: boolean;
  onChange?: () => void;
}) {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/cards/${cardId}/comments`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { items: CommentItem[] };
      setItems(j.items);
    } catch {
      /* ignore */
    }
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!r.ok) {
        setErr("댓글 작성에 실패했어요");
        return;
      }
      const j = (await r.json()) as { item: CommentItem };
      // comments-newest-first (2026-04-26): 새 댓글을 list 맨 앞에 prepend
      // 해서 폼 바로 아래에 노출.
      setItems((prev) => [j.item, ...(prev ?? [])]);
      setContent("");
      onChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("댓글을 삭제할까요?")) return;
    const r = await fetch(`/api/cards/${cardId}/comments/${id}`, { method: "DELETE" });
    if (r.ok) {
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onChange?.();
    } else {
      alert("삭제에 실패했어요");
    }
  };

  return (
    <div className="card-engagement-comments">
      {/* comments-form-top (2026-04-26): 입력 폼이 상단, 댓글 목록은 그 아래
          oldest → newest 순으로 쌓임. 새 댓글은 자연스럽게 list 끝에 추가. */}
      {canInteract ? (
        <form className="card-engagement-comment-form" onSubmit={submit}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요"
            maxLength={1000}
            rows={2}
            disabled={submitting}
          />
          <button type="submit" disabled={submitting || !content.trim()}>
            {submitting ? "작성 중..." : "댓글 달기"}
          </button>
          {err && <span className="card-engagement-comment-err">{err}</span>}
        </form>
      ) : (
        <div className="card-engagement-readonly">읽기 전용 (학부모는 댓글을 달 수 없어요)</div>
      )}
      {items === null ? (
        <div className="card-engagement-empty">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="card-engagement-empty">아직 댓글이 없어요</div>
      ) : (
        <ul className="card-engagement-comment-list">
          {items.map((c) => (
            <li key={c.id} className="card-engagement-comment-item">
              <div className="card-engagement-comment-head">
                <span className="card-engagement-comment-author">{c.authorLabel}</span>
                <span className="card-engagement-comment-time">{formatRelativeTime(c.createdAt)}</span>
                {c.canDelete && (
                  <button
                    type="button"
                    className="card-engagement-comment-delete"
                    onClick={() => remove(c.id)}
                    aria-label="삭제"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="card-engagement-comment-content">{c.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
