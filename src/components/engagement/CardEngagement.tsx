
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CommentsBlock, CommentsModal } from "./CardEngagementComments";
import { studentViewerHeaders } from "./card-engagement-comments-model";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import {
  useShareSession,
  type ShareSession,
} from "@/components/share/ShareSessionContext";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  useBoardEngagement,
  useBoardPollChange,
} from "@/hooks/useBoardEngagementRealtime";
import {
  BOARD_ENGAGEMENT_CONTEXT_EVENT,
  EMPTY_BOARD_ENGAGEMENT_CONTEXT,
  readBoardEngagementContext,
  type BoardEngagementContext,
} from "@/lib/board-engagement-context";
import {
  HiddenContentPlaceholder,
  StudentContentModerationControls,
  type HiddenReason,
} from "@/components/moderation/StudentContentModeration";

// card-comments-likes (2026-04-26): 카드별 좋아요 + 댓글 UI.
// mode="chips"  — 인라인 보드 카드 footer (좋아요 토글 + 댓글 카운트
//                  → 클릭 시 내부 모달 열어 댓글 패널 노출).
// mode="panel"  — CardDetailModal/showcase 등 이미 모달 안인 컨텍스트.
//                  댓글 패널을 통째로 인라인 렌더.

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
  /** Explicit parent surface. Do not infer from DOM ancestry. */
  viewer?: "parent";
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
  viewer,
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
  const isParentViewer = viewer === "parent";
  const cacheKey = getEngagementCacheKey({
    cardId,
    boardId: effectiveBoardId,
    isStudentViewer: effectiveIsStudentViewer,
    shareSession,
  });
  const cachedState = engagementStateCache.get(cacheKey);
  const [state, setState] = useState<EngagementState | null>(
    () =>
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
              ...(shareSession.guestId
                ? { "x-share-guest-id": shareSession.guestId }
                : {}),
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
        <span className="card-engagement-chip card-engagement-chip-loading">
          …
        </span>
        {chipsActionsEnd}
      </div>
    ) : null;
  }

  if (mode === "chips") {
    return (
      <>
        <div
          className="card-engagement-chips"
          onClick={(e) => e.stopPropagation()}
        >
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
            isParentViewer={isParentViewer}
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
          isParentViewer={isParentViewer}
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
