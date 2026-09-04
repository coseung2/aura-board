"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import type { ShareSession } from "@/components/share/ShareSessionContext";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { useBoardEngagement } from "@/hooks/useBoardEngagementRealtime";
import { HiddenContentPlaceholder, StudentContentModerationControls, type HiddenReason } from "@/components/moderation/StudentContentModeration";
import { appendThreadReply, removeThreadComment, studentViewerHeaders, updateThreadComments, type CommentAudience, type CommentItem } from "./card-engagement-comments-model";
import { CommentsPoll } from "./CardEngagementPoll";

export function CommentsModal({
  cardId,
  canInteract,
  shareSession,
  isStudentViewer,
  isParentViewer,
  boardId,
  onClose,
}: {
  cardId: string;
  canInteract: boolean;
  shareSession: ShareSession | null;
  isStudentViewer: boolean;
  isParentViewer: boolean;
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
      <div
        className="card-engagement-modal"
        onClick={(e) => e.stopPropagation()}
      >
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
            isParentViewer={isParentViewer}
            boardId={boardId}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

export function CommentsBlock({
  cardId,
  canInteract,
  shareSession,
  isStudentViewer,
  isParentViewer,
  boardId,
  onChange,
  inputId,
}: {
  cardId: string;
  canInteract: boolean;
  shareSession: ShareSession | null;
  isStudentViewer: boolean;
  isParentViewer: boolean;
  boardId?: string;
  onChange?: () => void;
  inputId?: string;
}) {
  const [audience, setAudience] = useState<CommentAudience>(() =>
    isParentViewer ? "guardian" : "public",
  );
  const [guardianAvailable, setGuardianAvailable] = useState<boolean | null>(
    null,
  );
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{
    rootId: string;
    targetId: string;
    authorLabel: string;
  } | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const loadQueuedRef = useRef(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenerationRef = useRef(0);
  const commentsMountedRef = useRef(false);
  const loadRef = useRef<(generation: number) => Promise<void>>(async () => {});
  const runLoadRef = useRef<() => void>(() => {});
  const publicTabRef = useRef<HTMLButtonElement>(null);
  const guardianTabRef = useRef<HTMLButtonElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const replyReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const replyRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (isParentViewer) setAudience("guardian");
  }, [isParentViewer]);

  const load = useCallback(
    async (generation: number) => {
      try {
        const r = shareSession
          ? await fetch(`/api/share/cards/${cardId}/comments`, {
              cache: "no-store",
              headers: { "x-share-token": shareSession.shareToken },
            })
          : await fetch(`/api/cards/${cardId}/comments?audience=${audience}`, {
              cache: "no-store",
              headers: studentViewerHeaders(isStudentViewer),
            });
        if (!r.ok) {
          if (
            audience === "guardian" &&
            commentsMountedRef.current &&
            generation === loadGenerationRef.current
          ) {
            setGuardianAvailable(false);
            setAudience("public");
            setItems(null);
          } else if (
            commentsMountedRef.current &&
            generation === loadGenerationRef.current
          ) {
            setLoadErr("댓글을 불러오지 못했어요");
          }
          return;
        }
        const j = (await r.json()) as {
          items: CommentItem[];
          guardianAvailable?: boolean;
        };
        if (
          !commentsMountedRef.current ||
          generation !== loadGenerationRef.current
        ) {
          return;
        }
        setLoadErr(null);
        setGuardianAvailable(j.guardianAvailable === true);
        if (audience === "guardian" && j.guardianAvailable !== true) {
          setAudience("public");
          setItems(null);
          return;
        }
        setItems(j.items);
      } catch {
        if (
          commentsMountedRef.current &&
          generation === loadGenerationRef.current
        ) {
          setLoadErr("댓글을 불러오지 못했어요");
        }
      }
    },
    [audience, cardId, shareSession, isStudentViewer],
  );
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

  const selectAudience = (nextAudience: CommentAudience) => {
    if (submitting || replySubmitting || nextAudience === audience) return;
    setAudience(nextAudience);
    setItems(null);
    setContent("");
    setErr(null);
    setLoadErr(null);
    setReplyContent("");
    setReplyErr(null);
    setReplyTarget(null);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (submitting || replySubmitting) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const nextAudience: CommentAudience =
      e.key === "ArrowLeft" || e.key === "Home" ? "public" : "guardian";
    selectAudience(nextAudience);
    (nextAudience === "public"
      ? publicTabRef
      : guardianTabRef
    ).current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || replySubmitting) return;
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
            body: JSON.stringify({ content: trimmed, audience }),
          });
      if (!r.ok) {
        setErr("댓글 작성에 실패했어요");
        return;
      }
      const j = (await r.json()) as {
        item?: CommentItem;
        comment?: CommentItem;
      };
      const item = j.item ?? j.comment;
      if (!item) {
        setErr("댓글 작성에 실패했어요");
        return;
      }
      // comments-newest-first (2026-04-26): 새 댓글을 list 맨 앞에 prepend
      // 해서 폼 바로 아래에 노출.
      setItems((prev) => [
        { ...item, replies: item.replies ?? [] },
        ...(prev ?? []),
      ]);
      setContent("");
      onChange?.();
    } catch {
      setErr("댓글 작성에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  };

  const closeReplyComposer = (restoreFocus: boolean) => {
    replyRestoreFocusRef.current = restoreFocus;
    setReplyContent("");
    setReplyErr(null);
    setReplyTarget(null);
  };

  const openReplyComposer = (
    item: CommentItem,
    trigger: HTMLButtonElement,
  ) => {
    replyRestoreFocusRef.current = false;
    replyReturnFocusRef.current = trigger;
    setReplyContent("");
    setReplyErr(null);
    setReplyTarget({
      rootId: item.parentCommentId ?? item.id,
      targetId: item.id,
      authorLabel: item.authorLabel || "작성자",
    });
  };

  useEffect(() => {
    if (replyTarget) replyInputRef.current?.focus();
  }, [replyTarget]);

  useEffect(() => {
    if (
      replyTarget ||
      replySubmitting ||
      !replyRestoreFocusRef.current
    ) {
      return;
    }
    replyRestoreFocusRef.current = false;
    replyReturnFocusRef.current?.focus();
  }, [replySubmitting, replyTarget]);

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!replyTarget || !trimmed || replySubmitting || shareSession) return;
    setReplySubmitting(true);
    setReplyErr(null);
    try {
      const r = await fetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders(isStudentViewer),
        },
        body: JSON.stringify({
          content: trimmed,
          audience,
          parentCommentId: replyTarget.targetId,
        }),
      });
      if (!r.ok) {
        setReplyErr("답글을 등록하지 못했어요");
        return;
      }
      const j = (await r.json()) as {
        item?: CommentItem;
        comment?: CommentItem;
      };
      const item = j.item ?? j.comment;
      if (!item) {
        setReplyErr("답글을 등록하지 못했어요");
        return;
      }
      setItems((current) =>
        current
          ? appendThreadReply(current, replyTarget.rootId, {
              ...item,
              replies: [],
            })
          : current,
      );
      closeReplyComposer(true);
      onChange?.();
    } catch {
      setReplyErr("답글을 등록하지 못했어요");
    } finally {
      setReplySubmitting(false);
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
      setItems((prev) => (prev ? removeThreadComment(prev, id) : null));
      if (replyTarget?.targetId === id || replyTarget?.rootId === id) {
        closeReplyComposer(false);
      }
      onChange?.();
    } else {
      alert("삭제에 실패했어요");
    }
  };

  const markCommentHidden = (
    id: string,
    hiddenReason: HiddenReason,
    hiddenStudentId?: string | null,
  ) => {
    setItems(
      (current) =>
        current
          ? updateThreadComments(current, (comment) =>
              comment.id === id ||
              (hiddenReason === "author" &&
                Boolean(hiddenStudentId) &&
                comment.authorStudentId === hiddenStudentId)
                ? {
                    ...comment,
                    content: "",
                    hiddenReason,
                    authorStudentId:
                      hiddenStudentId ?? comment.authorStudentId,
                  }
                : comment,
            )
          : null,
    );
  };

  const canWriteAudience =
    canInteract &&
    (!isParentViewer || audience === "guardian") &&
    (audience === "public" || guardianAvailable === true);
  const canReply = canWriteAudience && !shareSession;
  const tabsId = `card-comments-tabs-${cardId}`;
  const panelId = `card-comments-panel-${cardId}`;

  const renderCommentItem = (comment: CommentItem, isReply: boolean) => (
    <div
      className={`card-engagement-comment-item${isReply ? " is-reply" : ""}`}
    >
      {comment.hiddenReason ? (
        <HiddenContentPlaceholder
          targetKind="comment"
          targetId={comment.id}
          reason={comment.hiddenReason}

          hiddenStudentId={comment.authorStudentId}
          onRestored={() => requestLoad()}
        />
      ) : (
        <>
          <div className="card-engagement-comment-head">
            <span className="card-engagement-comment-author">
              {comment.authorLabel || "작성자"}
            </span>
            <span className="card-engagement-comment-time">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {comment.canDelete && (
              <button
                type="button"
                className="card-engagement-comment-delete"
                onClick={() => remove(comment.id)}
                aria-label="댓글 삭제"
              >
                삭제
              </button>
            )}
            {isStudentViewer && comment.canModerate && (
              <StudentContentModerationControls
                targetKind="comment"
                targetId={comment.id}
                authorStudentId={comment.authorStudentId}
                onHidden={(reason, hiddenStudentId) =>
                  markCommentHidden(comment.id, reason, hiddenStudentId)
                }
              />
            )}
          </div>
          <p className="card-engagement-comment-content">
            {comment.content}
          </p>
          {canReply && (
            <div className="card-engagement-comment-actions">
              <button
                type="button"
                className="card-engagement-comment-reply"
                onClick={(e) => openReplyComposer(comment, e.currentTarget)}
                aria-label={`${comment.authorLabel || "작성자"}에게 답글 달기`}
                disabled={submitting || replySubmitting}
              >
                답글 달기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="card-engagement-comments">
      {/* comment-area poll (2026-06-28): 댓글 입력/목록 위에 투표 UI. */}
      <CommentsPoll
        cardId={cardId}
        shareSession={shareSession}
        isStudentViewer={isStudentViewer}
        boardId={boardId}
      />
      {guardianAvailable === true && (
        <div
          id={tabsId}
          className="card-engagement-comment-tabs"
          role="tablist"
          aria-label="댓글 대화 선택"
        >
          <button
            id={`${tabsId}-public`}
            ref={publicTabRef}
            type="button"
            role="tab"
            aria-selected={audience === "public"}
            aria-controls={panelId}
            tabIndex={audience === "public" ? 0 : -1}
            disabled={submitting || replySubmitting}
            className={`card-engagement-comment-tab${audience === "public" ? " is-active" : ""}`}
            onClick={() => selectAudience("public")}
            onKeyDown={handleTabKeyDown}
          >
            학급 댓글
          </button>
          <button
            id={`${tabsId}-guardian`}
            ref={guardianTabRef}
            type="button"
            role="tab"
            aria-selected={audience === "guardian"}
            aria-controls={panelId}
            tabIndex={audience === "guardian" ? 0 : -1}
            disabled={submitting || replySubmitting}
            className={`card-engagement-comment-tab${audience === "guardian" ? " is-active" : ""}`}
            onClick={() => selectAudience("guardian")}
            onKeyDown={handleTabKeyDown}
          >
            보호자 댓글
          </button>
        </div>
      )}
      <div
        id={panelId}
        role={guardianAvailable === true ? "tabpanel" : undefined}
        aria-labelledby={
          guardianAvailable === true ? `${tabsId}-${audience}` : undefined
        }
        className="card-engagement-comment-thread"
      >
        {/* comments-form-top (2026-04-26): 입력 폼이 상단, 댓글 목록은 그 아래
          oldest → newest 순으로 쌓임. 새 댓글은 자연스럽게 list 끝에 추가. */}
        {canWriteAudience ? (
          <form className="card-engagement-comment-form" onSubmit={submit}>
            <textarea
              id={inputId}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key !== "Enter" ||
                  e.shiftKey ||
                  e.nativeEvent.isComposing
                ) {
                  return;
                }
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }}
              placeholder="댓글을 입력하세요"
              maxLength={1000}
              rows={2}
              disabled={submitting || replySubmitting}
            />
            {err && <span className="card-engagement-comment-err">{err}</span>}
          </form>
        ) : items !== null ? (
          <div className="card-engagement-readonly">
            읽기 전용이라 댓글을 달 수 없어요
          </div>
        ) : null}
        {loadErr && (
          <div className="card-engagement-comment-load-error" role="alert">
            <span>{loadErr}</span>
            <button
              type="button"
              onClick={() => {
                setLoadErr(null);
                requestLoad();
              }}
            >
              다시 시도
            </button>
          </div>
        )}
        {items === null ? (
          loadErr ? null : (
            <div className="card-engagement-empty">불러오는 중...</div>
          )
        ) : items.length === 0 ? (
          <div className="card-engagement-empty">아직 댓글이 없어요</div>
        ) : (
          <ul className="card-engagement-comment-list">
            {items.map((root) => (
              <li key={root.id} className="card-engagement-comment-thread-item">
                {renderCommentItem(root, false)}
                {(root.replies ?? []).length > 0 && (
                  <ul
                    className="card-engagement-comment-replies"
                    aria-label={`${root.authorLabel || "작성자"} 댓글의 답글`}
                  >
                    {(root.replies ?? []).map((reply) => (
                      <li key={reply.id}>{renderCommentItem(reply, true)}</li>
                    ))}
                  </ul>
                )}
                {replyTarget?.rootId === root.id && (
                  <form
                    className="card-engagement-reply-form"
                    onSubmit={submitReply}
                  >
                    <div
                      className="card-engagement-reply-target"
                      aria-live="polite"
                    >
                      {replyTarget.authorLabel}에게 답글
                    </div>
                    <div className="card-engagement-reply-row">
                      <textarea
                        ref={replyInputRef}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key !== "Enter" ||
                            e.shiftKey ||
                            e.nativeEvent.isComposing
                          ) {
                            return;
                          }
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }}
                        aria-label={`${replyTarget.authorLabel}에게 보낼 답글`}
                        placeholder="답글을 입력하세요"
                        maxLength={1000}
                        rows={2}
                        disabled={replySubmitting}
                      />
                      <button
                        type="submit"
                        className="card-engagement-reply-submit"
                        disabled={!replyContent.trim() || replySubmitting}
                      >
                        {replySubmitting ? "등록 중..." : "등록"}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="card-engagement-reply-cancel"
                      onClick={() => closeReplyComposer(true)}
                      disabled={replySubmitting}
                    >
                      취소
                    </button>
                    {replyErr && (
                      <span
                        className="card-engagement-comment-err"
                        role="alert"
                      >
                        {replyErr}
                      </span>
                    )}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
