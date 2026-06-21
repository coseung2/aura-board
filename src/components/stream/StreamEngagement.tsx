"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import { useShareSession, type ShareSession } from "@/components/share/ShareSessionContext";
import { useBoardEngagement } from "@/hooks/useBoardEngagementRealtime";

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  authorKind: "teacher" | "student" | "external";
  authorLabel: string;
  canDelete: boolean;
};

type EngagementState = {
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  canInteract: boolean;
};

type Props = {
  cardId: string;
  boardId?: string;
};

export function StreamEngagement({ cardId, boardId }: Props) {
  const [state, setState] = useState<EngagementState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shareSession = useShareSession();

  const refresh = useCallback(async () => {
    const next = await fetchEngagement(cardId, shareSession);
    if (next) setState(next);
    else if (shareSession) {
      setState((current) =>
        current ?? { likeCount: 0, commentCount: 0, isLiked: false, canInteract: true },
      );
    }
  }, [cardId, shareSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live-update counts from board-level engagement broadcasts. Only the
  // counts move here — isLiked is the current user's own state and is
  // already handled optimistically by toggleLike.
  useBoardEngagement(boardId, cardId, (event) => {
    setState((current) =>
      current
        ? { ...current, likeCount: event.likeCount, commentCount: event.commentCount }
        : current,
    );
  });

  const toggleLike = useCallback(async () => {
    if (!state?.canInteract) return;
    setState((current) =>
      current
        ? {
            ...current,
            isLiked: !current.isLiked,
            likeCount: current.likeCount + (current.isLiked ? -1 : 1),
          }
        : current,
    );
    try {
      const res = shareSession
        ? await fetch(`/api/share/cards/${cardId}/like`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              shareToken: shareSession.shareToken,
              guestId: shareSession.guestId,
            }),
          })
        : await fetch(`/api/cards/${cardId}/like`, { method: "POST" });
      if (!res.ok) {
        await refresh();
        return;
      }
      const body = (await res.json()) as { liked: boolean; count: number };
      setState((current) =>
        current ? { ...current, isLiked: body.liked, likeCount: body.count } : current,
      );
    } catch {
      await refresh();
    }
  }, [cardId, refresh, shareSession, state?.canInteract]);

  const commentCount = state?.commentCount ?? 0;

  return (
    <section className="stream-engagement" aria-label="반응">
      <div className="stream-actions">
        <button
          type="button"
          className={`stream-action${state?.isLiked ? " is-liked" : ""}`}
          onClick={toggleLike}
          disabled={!state?.canInteract}
          aria-pressed={state?.isLiked ?? false}
        >
          <span aria-hidden>{state?.isLiked ? "♥" : "♡"}</span>
          <span>{state?.likeCount ?? 0}</span>
        </button>
        <button
          type="button"
          className="stream-action"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <span aria-hidden>💬</span>
          <span>{commentCount}</span>
        </button>
      </div>
      <StreamComments
        cardId={cardId}
        expanded={expanded}
        canInteract={state?.canInteract ?? false}
        shareSession={shareSession}
        onChanged={() => {
          setExpanded(true);
          void refresh();
        }}
      />
    </section>
  );
}

function StreamComments({
  cardId,
  expanded,
  canInteract,
  shareSession,
  onChanged,
}: {
  cardId: string;
  expanded: boolean;
  canInteract: boolean;
  shareSession: ShareSession | null;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = shareSession
        ? await fetch(`/api/share/cards/${cardId}/comments`, {
            cache: "no-store",
            headers: { "x-share-token": shareSession.shareToken },
          })
        : await fetch(`/api/cards/${cardId}/comments`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { items: CommentItem[] };
      setItems(body.items);
    } catch {
      /* keep existing comments */
    }
  }, [cardId, shareSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedItems = useMemo(() => {
    return [...(items ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [items]);
  const visibleItems = expanded ? orderedItems : orderedItems.slice(-2);
  const hiddenCount = Math.max(0, orderedItems.length - visibleItems.length);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = shareSession
        ? await fetch(`/api/share/cards/${cardId}/comments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              shareToken: shareSession.shareToken,
              content: trimmed,
              authorName: shareSession.authorName,
            }),
          })
        : await fetch(`/api/cards/${cardId}/comments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: trimmed }),
          });
      if (!res.ok) {
        setError("댓글 작성에 실패했어요.");
        return;
      }
      const body = (await res.json()) as { item?: CommentItem; comment?: CommentItem };
      const item = body.item ?? body.comment;
      if (!item) {
        setError("댓글 작성에 실패했어요.");
        return;
      }
      setItems((current) => [...(current ?? []), item]);
      setContent("");
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function removeComment(id: string) {
    if (shareSession) return;
    if (!window.confirm("댓글을 삭제할까요?")) return;
    const res = await fetch(`/api/cards/${cardId}/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("댓글 삭제에 실패했어요.");
      return;
    }
    setItems((current) => current?.filter((comment) => comment.id !== id) ?? null);
    onChanged();
  }

  return (
    <div className="stream-comments">
      {hiddenCount > 0 && (
        <button type="button" className="stream-comments-more" onClick={() => onChanged()}>
          댓글 {orderedItems.length}개 모두 보기
        </button>
      )}
      {visibleItems.length > 0 && (
        <ul className="stream-comment-list">
          {visibleItems.map((comment) => (
            <li key={comment.id} className="stream-comment">
              <div className="stream-comment-copy">
                <span className="stream-comment-author">{comment.authorLabel}</span>
                <p>{comment.content}</p>
              </div>
              <div className="stream-comment-meta">
                <span>{formatRelativeTime(comment.createdAt)}</span>
                {comment.canDelete && !shareSession && (
                  <button type="button" onClick={() => removeComment(comment.id)}>
                    삭제
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canInteract ? (
        <form className="stream-comment-form" onSubmit={submit}>
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="댓글 달기..."
            maxLength={1000}
            disabled={submitting}
          />
          <button type="submit" disabled={submitting || !content.trim()}>
            게시
          </button>
        </form>
      ) : (
        <div className="stream-comment-readonly">댓글을 달 수 없는 상태예요.</div>
      )}
      {error && <div className="stream-comment-error">{error}</div>}
    </div>
  );
}

async function fetchEngagement(cardId: string, shareSession: ShareSession | null) {
  try {
    const res = shareSession
      ? await fetch(`/api/share/cards/${cardId}/engagement`, {
          cache: "no-store",
          headers: {
            "x-share-token": shareSession.shareToken,
            "x-share-guest-id": shareSession.guestId,
          },
        })
      : await fetch(`/api/cards/${cardId}/engagement`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as EngagementState;
  } catch {
    return null;
  }
}
