"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import { useShareSession, type ShareSession } from "@/components/share/ShareSessionContext";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { useBoardEngagement, useBoardPollChange } from "@/hooks/useBoardEngagementRealtime";
import {
  BOARD_ENGAGEMENT_CONTEXT_EVENT,
  EMPTY_BOARD_ENGAGEMENT_CONTEXT,
  readBoardEngagementContext,
  type BoardEngagementContext,
} from "@/lib/board-engagement-context";

// card-comments-likes (2026-04-26): 카드별 좋아요 + 댓글 UI.
// mode="chips"  — 인라인 보드 카드 footer (좋아요 토글 + 댓글 카운트
//                  → 클릭 시 내부 모달 열어 댓글 패널 노출).
// mode="panel"  — CardDetailModal/showcase 등 이미 모달 안인 컨텍스트.
//                  댓글 패널을 통째로 인라인 렌더.

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  authorKind: "teacher" | "student" | "external";
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
  boardId?: string;
  isStudentViewer?: boolean;
  initialCounts?: {
    likeCount: number;
    commentCount: number;
    isLiked?: boolean;
    canInteract?: boolean;
  };
  chipsActionsEnd?: ReactNode;
  panelActionsEnd?: ReactNode;
}

function initialEngagementState(
  likeCount: number | undefined,
  commentCount: number | undefined,
  isLiked: boolean | undefined,
  canInteract: boolean | undefined,
): EngagementState | null {
  return likeCount !== undefined || commentCount !== undefined
    ? {
        likeCount: likeCount ?? 0,
        commentCount: commentCount ?? 0,
        isLiked: isLiked ?? false,
        canInteract: canInteract ?? false,
      }
    : null;
}

const engagementStateCache = new Map<string, EngagementState>();

function getEngagementCacheKey({
  cardId,
  boardId,
  isStudentViewer,
  shareSession,
}: {
  cardId: string;
  boardId?: string;
  isStudentViewer?: boolean;
  shareSession: ShareSession | null;
}) {
  if (shareSession) {
    return `share:${shareSession.shareToken}:${shareSession.guestId}:${cardId}`;
  }
  return `board:${boardId ?? ""}:${isStudentViewer ? "student" : "user"}:${cardId}`;
}

export function CardEngagement({
  cardId,
  mode,
  boardId,
  isStudentViewer,
  initialCounts,
  chipsActionsEnd,
  panelActionsEnd,
}: Props) {
  const initialLikeCount = initialCounts?.likeCount;
  const initialCommentCount = initialCounts?.commentCount;
  const initialIsLiked = initialCounts?.isLiked;
  const initialCanInteract = initialCounts?.canInteract;
  const hasCompleteInitialState =
    initialIsLiked !== undefined && initialCanInteract !== undefined;
  const shareSession = useShareSession();
  const boardContext = useBoardPageEngagementContext();
  const effectiveBoardId = boardId ?? boardContext.boardId;
  const effectiveIsStudentViewer =
    isStudentViewer ?? boardContext.isStudentViewer;
  const cacheKey = getEngagementCacheKey({
    cardId,
    boardId: effectiveBoardId,
    isStudentViewer: effectiveIsStudentViewer,
    shareSession,
  });
  const cachedState = engagementStateCache.get(cacheKey);
  const [state, setState] = useState<EngagementState | null>(() =>
    cachedState ??
      initialEngagementState(
        initialLikeCount,
        initialCommentCount,
        initialIsLiked,
        initialCanInteract,
      ),
  );
  const [engagementReady, setEngagementReady] = useState(
    Boolean(cachedState) || hasCompleteInitialState || !initialCounts,
  );
  const [showModal, setShowModal] = useState(false);
  const likeInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const r = shareSession
        ? await fetch(`/api/share/cards/${cardId}/engagement`, {
            cache: "no-store",
            headers: {
              "x-share-token": shareSession.shareToken,
              ...(shareSession.guestId ? { "x-share-guest-id": shareSession.guestId } : {}),
            },
          })
        : await fetch(`/api/cards/${cardId}/engagement`, {
            cache: "no-store",
            headers: studentViewerHeaders(effectiveIsStudentViewer),
          });
      if (!r.ok) {
        if (shareSession) {
          setState((current) => {
            if (current) return current;
            const fallback = {
              likeCount: 0,
              commentCount: 0,
              isLiked: false,
              canInteract: true,
            };
            engagementStateCache.set(cacheKey, fallback);
            return fallback;
          });
        }
        return;
      }
      const j = (await r.json()) as EngagementState;
      engagementStateCache.set(cacheKey, j);
      setState(j);
    } catch {
      if (shareSession) {
        setState((current) => {
          if (current) return current;
          const fallback = {
            likeCount: 0,
            commentCount: 0,
            isLiked: false,
            canInteract: true,
          };
          engagementStateCache.set(cacheKey, fallback);
          return fallback;
        });
      }
    } finally {
      setEngagementReady(true);
    }
  }, [cacheKey, cardId, shareSession, effectiveIsStudentViewer]);

  useEffect(() => {
    const cached = engagementStateCache.get(cacheKey);
    const initial = initialEngagementState(
      initialLikeCount,
      initialCommentCount,
      initialIsLiked,
      initialCanInteract,
    );
    const next = cached ?? initial;
    setEngagementReady(Boolean(cached) || hasCompleteInitialState);
    setState(next);
    if (!cached && initial && hasCompleteInitialState) {
      engagementStateCache.set(cacheKey, initial);
      return;
    }
    if (!cached && !hasCompleteInitialState) void refresh();
  }, [
    cacheKey,
    refresh,
    initialLikeCount,
    initialCommentCount,
    initialIsLiked,
    initialCanInteract,
    hasCompleteInitialState,
  ]);

  // Live-update counts from board-level engagement broadcasts. Only counts
  // move; isLiked is the current user's own state (handled in toggleLike).
  useBoardEngagement(effectiveBoardId, cardId, (event) => {
    if (event.type !== "engagement_changed") return;
    setState((current) => {
      if (!current) return current;
      const next = {
        ...current,
        likeCount: event.likeCount,
        commentCount: event.commentCount,
      };
      engagementStateCache.set(cacheKey, next);
      return next;
    });
  });

  useEffect(() => {
    // When a boardId is wired, board-level broadcasts drive updates and we
    // skip the per-card postgres_changes channel. Share sessions without a
    // boardId keep the per-card subscription.
    if (!shareSession || effectiveBoardId) return;
    const supabase = createPublicSupabaseClient({
      "x-share-token": shareSession.shareToken,
      "x-share-guest-id": shareSession.guestId,
    });
    const channel = supabase
      .channel(`share-card-engagement:${cardId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "CardLike",
          filter: `cardId=eq.${cardId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "CardComment",
          filter: `cardId=eq.${cardId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cardId, refresh, shareSession, effectiveBoardId]);

  const toggleLike = useCallback(async () => {
    if (!state?.canInteract || likeInFlightRef.current) return;
    const desiredLiked = !state.isLiked;
    likeInFlightRef.current = true;
    // optimistic
    setState((s) => {
      if (!s) return s;
      const next = {
        ...s,
        isLiked: desiredLiked,
        likeCount: Math.max(0, s.likeCount + (desiredLiked ? 1 : -1)),
      };
      engagementStateCache.set(cacheKey, next);
      return next;
    });
    try {
      const r = shareSession
        ? await fetch(`/api/share/cards/${cardId}/like`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              shareToken: shareSession.shareToken,
              guestId: shareSession.guestId,
              liked: desiredLiked,
            }),
          })
        : await fetch(`/api/cards/${cardId}/like`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...studentViewerHeaders(effectiveIsStudentViewer),
            },
            body: JSON.stringify({ liked: desiredLiked }),
          });
      if (!r.ok) {
        await refresh();
        return;
      }
      const j = (await r.json()) as { liked: boolean; count: number };
      setState((s) => {
        if (!s) return s;
        const next = { ...s, isLiked: j.liked, likeCount: j.count };
        engagementStateCache.set(cacheKey, next);
        return next;
      });
    } catch {
      await refresh();
    } finally {
      likeInFlightRef.current = false;
    }
  }, [
    cacheKey,
    cardId,
    refresh,
    shareSession,
    state?.canInteract,
    state?.isLiked,
    effectiveIsStudentViewer,
  ]);

  if (!state) {
    return mode === "chips" ? (
      <div className="card-engagement-chips" aria-hidden>
        <span className="card-engagement-chip card-engagement-chip-loading">…</span>
        {chipsActionsEnd}
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
            title={state.canInteract ? "" : "읽기 전용입니다"}
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
          {chipsActionsEnd}
        </div>
        {showModal && (
          <CommentsModal
            cardId={cardId}
            canInteract={state.canInteract}
            shareSession={shareSession}
            isStudentViewer={effectiveIsStudentViewer}
            boardId={effectiveBoardId}
            onClose={() => {
              setShowModal(false);
              void refresh();
            }}
          />
        )}
      </>
    );
  }

  // panel mode — 인라인 풀 패널
  const commentInputId = `card-comments-input-${cardId}`;
  return (
    <div className="card-engagement-panel">
      <div className="card-engagement-panel-likeRow">
        <button
          type="button"
          className={`card-engagement-like-btn${state.isLiked ? " is-liked" : ""}`}
          onClick={toggleLike}
          disabled={!state.canInteract}
          aria-pressed={state.isLiked}
          title={
            engagementReady ? (state.canInteract ? "" : "읽기 전용입니다") : ""
          }
        >
          <span aria-hidden>{state.isLiked ? "❤️" : "🤍"}</span>
          <span>{state.likeCount}</span>
        </button>
        <button
          type="button"
          className="card-engagement-comment-btn"
          disabled={!engagementReady}
          onClick={() => document.getElementById(commentInputId)?.focus()}
          aria-label={`댓글 ${state.commentCount}개`}
        >
          <span aria-hidden>💬</span>
          <span>{state.commentCount}</span>
        </button>
        {panelActionsEnd}
      </div>
      {engagementReady && (
        <CommentsBlock
          cardId={cardId}
          canInteract={state.canInteract}
          shareSession={shareSession}
          isStudentViewer={effectiveIsStudentViewer}
          boardId={effectiveBoardId}
          onChange={refresh}
          inputId={commentInputId}
        />
      )}
    </div>
  );
}

function useBoardPageEngagementContext(): BoardEngagementContext {
  const [context, setContext] = useState<BoardEngagementContext>(() =>
    typeof document === "undefined"
      ? EMPTY_BOARD_ENGAGEMENT_CONTEXT
      : readBoardEngagementContext(),
  );

  useEffect(() => {
    const update = () => setContext(readBoardEngagementContext());
    update();
    window.addEventListener(BOARD_ENGAGEMENT_CONTEXT_EVENT, update);
    return () => {
      window.removeEventListener(BOARD_ENGAGEMENT_CONTEXT_EVENT, update);
    };
  }, []);

  return context;
}

function studentViewerHeaders(isStudentViewer: boolean): Record<string, string> {
  return isStudentViewer ? { "x-aura-student-viewer": "1" } : {};
}

function CommentsModal({
  cardId,
  canInteract,
  shareSession,
  isStudentViewer,
  boardId,
  onClose,
}: {
  cardId: string;
  canInteract: boolean;
  shareSession: ShareSession | null;
  isStudentViewer: boolean;
  boardId?: string;
  onClose: () => void;
}) {
  // engagement-modal-portal (2026-04-26): 모달이 카드 DOM 안에 그대로 있으면
  // 부모 .portfolio-card / .showcase-chip 의 pointer-events:none 가
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
            className="ui-icon-action card-engagement-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="card-engagement-modal-body">
          <CommentsBlock
            cardId={cardId}
            canInteract={canInteract}
            shareSession={shareSession}
            isStudentViewer={isStudentViewer}
            boardId={boardId}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function CommentsBlock({
  cardId,
  canInteract,
  shareSession,
  isStudentViewer,
  boardId,
  onChange,
  inputId,
}: {
  cardId: string;
  canInteract: boolean;
  shareSession: ShareSession | null;
  isStudentViewer: boolean;
  boardId?: string;
  onChange?: () => void;
  inputId?: string;
}) {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const loadQueuedRef = useRef(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenerationRef = useRef(0);
  const commentsMountedRef = useRef(false);
  const loadRef = useRef<(generation: number) => Promise<void>>(async () => {});
  const runLoadRef = useRef<() => void>(() => {});

  const load = useCallback(async (generation: number) => {
    try {
      const r = shareSession
        ? await fetch(`/api/share/cards/${cardId}/comments`, {
            cache: "no-store",
            headers: { "x-share-token": shareSession.shareToken },
          })
        : await fetch(`/api/cards/${cardId}/comments`, {
            cache: "no-store",
            headers: studentViewerHeaders(isStudentViewer),
          });
      if (!r.ok) return;
      const j = (await r.json()) as { items: CommentItem[] };
      if (
        !commentsMountedRef.current ||
        generation !== loadGenerationRef.current
      ) {
        return;
      }
      setItems(j.items);
    } catch {
      /* ignore */
    }
  }, [cardId, shareSession, isStudentViewer]);
  loadRef.current = load;

  const runLoad = useCallback(() => {
    if (!commentsMountedRef.current) return;
    if (loadInFlightRef.current) {
      loadQueuedRef.current = true;
      return;
    }

    const generation = loadGenerationRef.current;
    const request = loadRef.current(generation).finally(() => {
      if (loadInFlightRef.current === request) {
        loadInFlightRef.current = null;
      }
      if (loadQueuedRef.current && commentsMountedRef.current) {
        loadQueuedRef.current = false;
        queueMicrotask(() => runLoadRef.current());
      }
    });
    loadInFlightRef.current = request;
  }, []);
  runLoadRef.current = runLoad;

  const requestLoad = useCallback(
    (delayMs = 0) => {
      if (delayMs > 0) {
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
        loadTimerRef.current = setTimeout(() => {
          loadTimerRef.current = null;
          runLoad();
        }, delayMs);
        return;
      }

      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
      }
      runLoad();
    },
    [runLoad],
  );

  useEffect(() => {
    commentsMountedRef.current = true;
    loadGenerationRef.current += 1;
    requestLoad();
    return () => {
      commentsMountedRef.current = false;
      loadGenerationRef.current += 1;
      loadQueuedRef.current = false;
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
      }
    };
  }, [load, requestLoad]);

  useBoardEngagement(boardId, cardId, (event) => {
    // Older servers did not send changeType; treat those events as a possible
    // comment change for backwards compatibility. Likes never fetch comments.
    if (event.changeType === "like") return;
    requestLoad(60);
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = shareSession
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
            headers: {
              "content-type": "application/json",
              ...studentViewerHeaders(isStudentViewer),
            },
            body: JSON.stringify({ content: trimmed }),
          });
      if (!r.ok) {
        setErr("댓글 작성에 실패했어요");
        return;
      }
      const j = (await r.json()) as { item?: CommentItem; comment?: CommentItem };
      const item = j.item ?? j.comment;
      if (!item) {
        setErr("댓글 작성에 실패했어요");
        return;
      }
      // comments-newest-first (2026-04-26): 새 댓글을 list 맨 앞에 prepend
      // 해서 폼 바로 아래에 노출.
      setItems((prev) => [item, ...(prev ?? [])]);
      setContent("");
      onChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (shareSession) return;
    if (!confirm("댓글을 삭제할까요?")) return;
    const r = await fetch(`/api/cards/${cardId}/comments/${id}`, {
      method: "DELETE",
      headers: studentViewerHeaders(isStudentViewer),
    });
    if (r.ok) {
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onChange?.();
    } else {
      alert("삭제에 실패했어요");
    }
  };

  return (
    <div className="card-engagement-comments">
      {/* comment-area poll (2026-06-28): 댓글 입력/목록 위에 투표 UI. */}
      <CommentsPoll
        cardId={cardId}
        shareSession={shareSession}
        isStudentViewer={isStudentViewer}
        boardId={boardId}
      />
      {/* comments-form-top (2026-04-26): 입력 폼이 상단, 댓글 목록은 그 아래
          oldest → newest 순으로 쌓임. 새 댓글은 자연스럽게 list 끝에 추가. */}
      {canInteract ? (
        <form className="card-engagement-comment-form" onSubmit={submit}>
          <textarea
            id={inputId}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
                return;
              }
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            placeholder="댓글을 입력하세요"
            maxLength={1000}
            rows={2}
            disabled={submitting}
          />
          {err && <span className="card-engagement-comment-err">{err}</span>}
        </form>
      ) : (
        <div className="card-engagement-readonly">읽기 전용이라 댓글을 달 수 없어요</div>
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

// comment-area poll (2026-06-28): 카드 댓글 영역 투표 UI.
type PollState = {
  enabled: boolean;
  optionCount: number;
  counts: number[];
  labels: string[];
  voters: Array<Array<{ id: string; name: string }>>;
  total: number;
  selectedOption: number | null;
  canVote: boolean;
};

function CommentsPoll({
  cardId,
  shareSession,
  isStudentViewer,
  boardId,
}: {
  cardId: string;
  shareSession: ShareSession | null;
  isStudentViewer: boolean;
  boardId?: string;
}) {
  const [poll, setPoll] = useState<PollState | null>(null);
  const [voting, setVoting] = useState(false);
  const [openOption, setOpenOption] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (shareSession) {
      setPoll(null);
      return;
    }
    try {
      const r = await fetch(`/api/cards/${cardId}/poll`, {
        cache: "no-store",
        headers: studentViewerHeaders(isStudentViewer),
      });
      if (!r.ok) return;
      const j = (await r.json()) as PollState;
      setPoll(j);
    } catch {
      /* ignore */
    }
  }, [cardId, shareSession, isStudentViewer]);

  useEffect(() => {
    void load();
  }, [load]);

  useBoardPollChange(boardId, cardId, () => {
    void load();
  });

  const vote = async (optionIndex: number) => {
    if (shareSession || voting || !poll?.canVote || poll.selectedOption === optionIndex) return;
    setVoting(true);
    setOpenOption(optionIndex);
    setPoll((current) => {
      if (!current) return current;
      const old = current.selectedOption;
      const nextCounts = [...current.counts];
      if (old !== null && old >= 0 && old < nextCounts.length) {
        nextCounts[old] = Math.max(0, nextCounts[old] - 1);
      }
      if (optionIndex >= 0 && optionIndex < nextCounts.length) {
        nextCounts[optionIndex]++;
      }
      return {
        ...current,
        selectedOption: optionIndex,
        counts: nextCounts,
        total: old === null ? current.total + 1 : current.total,
      };
    });
    try {
      const r = await fetch(`/api/cards/${cardId}/poll`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders(isStudentViewer),
        },
        body: JSON.stringify({ optionIndex }),
      });
      if (!r.ok) {
        await load();
        return;
      }
      const j = (await r.json()) as PollState;
      setPoll(j);
    } catch {
      await load();
    } finally {
      setVoting(false);
    }
  };

  if (!poll?.enabled) return null;

  const toggleOption = (optionIndex: number) => {
    if (poll.canVote && poll.selectedOption !== optionIndex) {
      void vote(optionIndex);
      return;
    }
    setOpenOption((current) => (current === optionIndex ? null : optionIndex));
  };
  const openVoters =
    openOption !== null ? (poll.voters[openOption] ?? []) : [];
  const openLabel =
    openOption !== null
      ? poll.labels[openOption] ?? `${openOption + 1}번`
      : "";

  return (
    <div className="card-engagement-poll" role="group" aria-label="투표">
      <div className="card-engagement-poll-options">
        {poll.counts.map((count, idx) => {
          const selected = poll.selectedOption === idx;
          const expanded = openOption === idx;
          const label = poll.labels[idx] ?? `${idx + 1}번`;
          return (
            <button
              key={idx}
              type="button"
              className={`card-engagement-poll-option${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`}
              onClick={() => toggleOption(idx)}
              disabled={voting}
              aria-pressed={selected}
              aria-expanded={expanded}
              aria-label={`${label} (${count}표), 투표자 보기`}
            >
              <span className="card-engagement-poll-option-label">{label}</span>
              <span className="card-engagement-poll-option-count">{count}표</span>
            </button>
          );
        })}
      </div>
      {openOption !== null && (
        <div className="card-engagement-poll-voters">
          <span className="card-engagement-poll-voters-title">
            {openLabel} 투표자
          </span>
          {openVoters.length > 0 ? (
            <span className="card-engagement-poll-voters-list">
              {openVoters.map((voter) => voter.name).join(", ")}
            </span>
          ) : (
            <span className="card-engagement-poll-voters-empty">
              아직 없어요
            </span>
          )}
        </div>
      )}
      <div className="card-engagement-poll-total">총 {poll.total}명 참여</div>
    </div>
  );
}
