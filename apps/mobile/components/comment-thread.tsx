import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import {
  type RewardFeedback,
  useCommentRewardFeedback,
} from "../hooks/use-comment-reward-feedback";
import { ApiError, apiFetch, parentApiFetch } from "../lib/api";
import {
  canComposeComment,
  type CommentAudience,
  commentAudienceLabel,
  commentsPath,
  type CommentViewer,
  FAMILY_THREAD_PRIVATE_MESSAGE,
  initialCommentAudience,
  visibleCommentsForViewer,
} from "../lib/comment-audience";
import { commentRequest, type CommentRequest } from "../lib/comment-request";
import {
  appendThreadReply,
  type MobileCommentItem as CommentItem,
  removeThreadComment,
  updateThreadComment,
} from "../lib/comment-thread";
import {
  hiddenPlaceholderText,
  type HiddenReason,
  hideContent,
  reportContent,
  unhideContent,
} from "../lib/content-safety";
import {
  clearParentSession,
  clearSessionToken,
  getUnifiedLoginRoute,
} from "../lib/session";
import {
  BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  useBoardRealtime,
} from "../lib/use-board-realtime";
import { colors, spacing } from "../theme/tokens";
import { styles } from "./comment-bottom-sheet.styles";
import { CommentThreadFrame } from "./comment-thread-frame";
import { CommentLikeButton } from "./CommentLikeButton";
import {
  type CommentAnchor,
  CommentModerationOverlay,
} from "./CommentModerationOverlay";
import { FeedbackToast } from "./FeedbackToast";
import { ContentTab, ContentTabs } from "./NavigationTabs";
import { AppButton, BarePressable, TextActionPressable, TextField } from "./ui";

export type CommentThreadProps = {
  page?: boolean;
  cardId: string | null;
  boardId?: string;
  visible: boolean;
  onClose: () => void;
  onCommentCountChange?: (change: number) => void;
  viewer?: CommentViewer;
  resourceKind?: "card" | "feed";
};

function commentsResourcePath(
  id: string,
  audience: CommentAudience,
  resourceKind: "card" | "feed",
) {
  if (resourceKind === "feed") return `/api/student/feed/${encodeURIComponent(id)}/comments`;
  return commentsPath(id, audience);
}

export function CommentThread({
  page = false,
  cardId,
  boardId,
  visible,
  onClose,
  onCommentCountChange,
  viewer = "student",
  resourceKind = "card",
}: CommentThreadProps) {
  const router = useRouter();
  const rewardFeedback = useCommentRewardFeedback((path) =>
    apiFetch<RewardFeedback>(path),
  );
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [items, setItems] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyTarget, setReplyTarget] = useState<{
    rootId: string;
    targetId: string;
    authorLabel: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<{
    item: CommentItem;
    anchor: CommentAnchor;
  } | null>(null);
  const commentRefs = useRef(new Map<string, View>());
  const [audience, setAudience] = useState<CommentAudience>(() =>
    initialCommentAudience(viewer),
  );
  const [guardianAvailable, setGuardianAvailable] = useState(false);
  const requestVersion = useRef(0);
  const pendingWrites = useRef(0);
  const commentAttempt = useRef<CommentRequest | null>(null);
  const replyAttempt = useRef<CommentRequest | null>(null);
  const [retryWrite, setRetryWrite] = useState<"comment" | "reply" | null>(
    null,
  );
  const feedResource = resourceKind === "feed";
  const commentTargetKind = feedResource ? "feed_comment" : "comment";

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) {
        return false;
      }
      if (viewer === "parent") await clearParentSession();
      else await clearSessionToken();
      closeRef.current();
      router.replace(getUnifiedLoginRoute(viewer));
      return true;
    },
    [router, viewer],
  );

  const loadComments = useCallback(
    async (nextAudience: CommentAudience, quiet = false) => {
      if (!cardId || pendingWrites.current > 0) return;
      const version = ++requestVersion.current;
      if (!quiet) setLoading(true);
      try {
        if (!quiet) setError(null);
        const request = viewer === "parent" ? parentApiFetch : apiFetch;
        const response = await request<{
          items: CommentItem[];
          guardianAvailable?: boolean;
        }>(commentsResourcePath(cardId, nextAudience, resourceKind));
        if (version !== requestVersion.current) return;
        const nextGuardianAvailable = response.guardianAvailable === true;
        setGuardianAvailable(nextGuardianAvailable);
        setItems(
          visibleCommentsForViewer(
            viewer,
            nextGuardianAvailable,
            response.items ?? [],
          ),
        );
        if (viewer === "parent" && !nextGuardianAvailable) {
          setError(
            "가족 댓글을 열 수 없어요. 앱과 서버를 최신 버전으로 업데이트해 주세요.",
          );
        }
      } catch (nextError) {
        if (version !== requestVersion.current) return;
        if (await handleAuthError(nextError)) return;
        if (
          nextError instanceof ApiError &&
          [403, 404].includes(nextError.status)
        )
          setItems([]);
        setError(
          viewer === "student" &&
            nextAudience === "guardian" &&
            nextError instanceof ApiError &&
            nextError.status === 403
            ? FAMILY_THREAD_PRIVATE_MESSAGE
            : "댓글을 불러오지 못했어요.",
        );
        if (
          quiet &&
          !(
            nextError instanceof ApiError &&
            [403, 404].includes(nextError.status)
          )
        )
          throw nextError;
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [cardId, handleAuthError, resourceKind, viewer],
  );

  useEffect(() => {
    if (!visible || !cardId) return;
    setAudience(initialCommentAudience(viewer));
    setGuardianAvailable(false);
    setCommentText("");
    setReplyText("");
    setReplyTarget(null);
    void loadComments(initialCommentAudience(viewer));
    return () => {
      requestVersion.current += 1;
    };
  }, [cardId, loadComments, visible]);

  useBoardRealtime({
    slug: boardId ?? "",
    enabled:
      visible &&
      Boolean(cardId) &&
      viewer === "student" &&
      resourceKind === "card",
    fallbackPollMs: BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
    onReload: () => loadComments(audience, true),
  });

  function selectAudience(nextAudience: CommentAudience) {
    if (pendingWrites.current > 0) return;
    setRetryWrite(null);
    setModerationTarget(null);
    if (nextAudience === audience) return;
    setAudience(nextAudience);
    setCommentText("");
    setReplyText("");
    setReplyTarget(null);
    if (
      viewer === "student" &&
      nextAudience === "guardian" &&
      !guardianAvailable
    ) {
      setItems([]);
      setError(FAMILY_THREAD_PRIVATE_MESSAGE);
      return;
    }
    void loadComments(nextAudience);
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!cardId || !content || submitting) return;
    commentAttempt.current = commentRequest(
      commentAttempt.current,
      JSON.stringify([cardId, audience, content]),
    );
    setSubmitting(true);
    pendingWrites.current += 1;
    requestVersion.current += 1;
    try {
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      const response = await request<{
        item?: CommentItem;
        comment?: CommentItem;
        rewardNotice?: string | null;
      }>(commentsResourcePath(cardId, audience, resourceKind), {
        method: "POST",
        json: { content, audience, clientRequestId: commentAttempt.current.id },
      });
      const item = response.item ?? response.comment;
      if (!item) throw new Error("missing comment");
      if (viewer === "parent" && item.audience !== "guardian") {
        // Do not render a possibly-public response from an outdated server.
        // The composer is unavailable until guardianAvailable is confirmed,
        // but retain this boundary for malformed or cached responses too.
        setError(
          "가족 댓글을 확인할 수 없어요. 앱과 서버를 최신 버전으로 업데이트해 주세요.",
        );
        return;
      }
      setItems((current) => [
        { ...item, replies: item.replies ?? [] },
        ...current,
      ]);
      setCommentText("");
      setRetryWrite(null);
      commentAttempt.current = null;
      if (viewer === "student" && resourceKind === "card")
        void rewardFeedback.track(cardId, item.id);
      else rewardFeedback.show("댓글을 등록했어요.", "success");
      setError(null);
      if (audience === "public") onCommentCountChange?.(1);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 등록하지 못했어요.");
      rewardFeedback.show(
        "댓글을 등록하지 못했어요. 입력한 내용은 남아 있어요.",
        "error",
      );
      setRetryWrite("comment");
    } finally {
      setSubmitting(false);
      pendingWrites.current -= 1;
      requestVersion.current += 1;
      setLoading(false);
    }
  }

  function confirmDelete(item: CommentItem) {
    Alert.alert("댓글 삭제", "이 댓글을 삭제할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => void deleteComment(item.id),
      },
    ]);
  }

  async function deleteComment(commentId: string) {
    if (!cardId) return;
    try {
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      await request(
        resourceKind === "feed"
          ? `/api/student/feed/comments/${encodeURIComponent(commentId)}`
          : `/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      setItems((current) => removeThreadComment(current, commentId));
      setError(null);
      if (audience === "public") onCommentCountChange?.(-1);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 삭제하지 못했어요.");
    }
  }

  function openReplyComposer(item: CommentItem) {
    if (pendingWrites.current > 0) return;
    setRetryWrite(null);
    setModerationTarget(null);
    setReplyText("");
    setReplyTarget({
      rootId: item.parentCommentId ?? item.id,
      targetId: item.id,
      authorLabel: item.authorLabel || "작성자",
    });
  }

  async function submitReply() {
    const content = replyText.trim();
    if (!cardId || !replyTarget || !content || replySubmitting) return;
    replyAttempt.current = commentRequest(
      replyAttempt.current,
      JSON.stringify([cardId, audience, replyTarget.targetId, content]),
    );
    setReplySubmitting(true);
    pendingWrites.current += 1;
    requestVersion.current += 1;
    try {
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      const response = await request<{
        item?: CommentItem;
        comment?: CommentItem;
      }>(commentsResourcePath(cardId, audience, resourceKind), {
        method: "POST",
        json: {
          content,
          audience,
          parentCommentId: replyTarget.targetId,
          clientRequestId: replyAttempt.current.id,
        },
      });
      const item = response.item ?? response.comment;
      if (!item) throw new Error("missing reply");
      setItems((current) =>
        appendThreadReply(current, replyTarget.rootId, {
          ...item,
          replies: [],
        }),
      );
      setReplyText("");
      setReplyTarget(null);
      setRetryWrite(null);
      replyAttempt.current = null;
      if (viewer === "student" && resourceKind === "card")
        void rewardFeedback.track(cardId, item.id);
      else rewardFeedback.show("답글을 등록했어요.", "success");
      setError(null);
      if (audience === "public") onCommentCountChange?.(1);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("답글을 등록하지 못했어요.");
      rewardFeedback.show(
        "답글을 등록하지 못했어요. 다시 시도해 주세요.",
        "error",
      );
      setRetryWrite("reply");
    } finally {
      setReplySubmitting(false);
      pendingWrites.current -= 1;
      requestVersion.current += 1;
      setLoading(false);
    }
  }

  /** Mark one comment hidden or visible in local state. */
  function applyHiddenReason(
    commentId: string,
    hiddenReason: HiddenReason | null,
  ) {
    setItems((current) =>
      updateThreadComment(current, commentId, (item) => ({
        ...item,
        hiddenReason,
      })),
    );
  }

  async function hideComment(item: CommentItem) {
    applyHiddenReason(item.id, "item");
    try {
      await hideContent({ targetKind: commentTargetKind, targetId: item.id });
    } catch (nextError) {
      // Roll back so the student never sees a hide that did not persist.
      applyHiddenReason(item.id, item.hiddenReason ?? null);
      if (await handleAuthError(nextError)) return;
      throw nextError;
    }
  }

  async function unhideComment(item: CommentItem) {
    applyHiddenReason(item.id, null);
    try {
      await unhideContent({ targetKind: commentTargetKind, targetId: item.id });
      // Content was blanked server-side while hidden, so refetch to restore it.
      await loadComments(audience);
    } catch (nextError) {
      applyHiddenReason(item.id, item.hiddenReason ?? "item");
      if (await handleAuthError(nextError)) return;
      setError("숨긴 댓글을 되돌리지 못했어요.");
    }
  }

  async function reportComment(
    item: CommentItem,
    input: {
      reason: Parameters<typeof reportContent>[0]["reason"];
      detail?: string;
      hideAuthor: boolean;
    },
  ) {
    const result = await reportContent({
      targetKind: commentTargetKind,
      targetId: item.id,
      reason: input.reason,
      detail: input.detail,
      hideAuthor: input.hideAuthor,
    });
    // The server hides the reported comment for the reporter.
    applyHiddenReason(item.id, result.hiddenAuthor ? "author" : "item");
    if (result.hiddenAuthor && result.authorStudentId) {
      await loadComments(audience);
    }
  }

  const isFamilyAccessNotice = error === FAMILY_THREAD_PRIVATE_MESSAGE;

  async function quickHideComment(item: CommentItem) {
    setModerationTarget(null);
    try {
      await hideComment(item);
      setError(null);
    } catch {
      setError("댓글을 숨기지 못했어요.");
    }
  }

  function confirmReportComment(item: CommentItem) {
    Alert.alert(
      "댓글 신고",
      item.authorStudentId
        ? "이 댓글을 신고하고 작성자를 차단할까요?"
        : "이 댓글을 신고할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "신고",
          style: "destructive",
          onPress: () => {
            setModerationTarget(null);
            void reportComment(item, {
              reason: "other",
              hideAuthor: Boolean(item.authorStudentId),
            })
              .then(() => {
                setError(null);
                Alert.alert("신고 완료", "선생님에게 신고를 보냈어요.");
              })
              .catch(() => setError("신고를 보내지 못했어요."));
          },
        },
      ],
    );
  }

  function openModerationMenu(item: CommentItem) {
    commentRefs.current.get(item.id)?.measureInWindow((x, y, width, height) => {
      setModerationTarget({ item, anchor: { x, y, width, height } });
    });
  }

  const replyEnabled =
    canComposeComment(viewer, audience) &&
    (viewer !== "parent" || guardianAvailable) &&
    (viewer !== "student" || audience !== "guardian" || guardianAvailable);

  function renderCommentItem(item: CommentItem, isReply: boolean) {
    if (item.hiddenReason) {
      return (
        <View
          key={item.id}
          style={[styles.hiddenItem, isReply && styles.replyItem]}
        >
          <Text style={styles.hiddenText}>
            {hiddenPlaceholderText("comment", item.hiddenReason)}
          </Text>
          {item.hiddenReason === "item" ? (
            <TextActionPressable
              style={styles.hiddenAction}
              onPress={() => void unhideComment(item)}
              accessibilityLabel="숨긴 댓글 다시 보기"
              hitSlop={spacing.sm}
            >
              <Text style={styles.hiddenActionLabel}>다시 보기</Text>
            </TextActionPressable>
          ) : null}
        </View>
      );
    }

    return (
      <View
        key={item.id}
        ref={(node) => {
          if (node) commentRefs.current.set(item.id, node);
          else commentRefs.current.delete(item.id);
        }}
        style={[styles.commentItem, isReply && styles.replyItem]}
      >
        <View style={styles.commentItemRow}>
          <BarePressable
            style={styles.commentTextBlock}
            onPress={() => setModerationTarget(null)}
            onLongPress={
              item.canModerate ? () => openModerationMenu(item) : undefined
            }
            delayLongPress={350}
            accessible={item.canModerate}
            accessibilityRole={item.canModerate ? "button" : undefined}
            accessibilityLabel={
              item.canModerate
                ? `${item.authorLabel || "작성자"}의 댓글. 길게 눌러 숨기기 또는 신고`
                : undefined
            }
          >
            <View style={styles.commentHeader}>
              <View style={styles.commentIdentity}>
                <Text style={styles.commentAuthor} numberOfLines={1}>
                  {item.authorLabel || "작성자"}
                </Text>
                <Text style={styles.commentDate}>
                  {formatCommentDate(item.createdAt)}
                </Text>
              </View>
            </View>
            <Text style={styles.commentContent}>{item.content}</Text>
          </BarePressable>
          <CommentLikeButton
            cardId={cardId ?? ""}
            commentId={item.id}
            resourceKind={resourceKind}
            likeCount={item.likeCount}
            isLiked={item.isLiked}
            viewer={viewer}
            onInteractionStart={() => setModerationTarget(null)}
            onUnauthorized={handleAuthError}
            onChanged={(next) => {
              setItems((current) =>
                updateThreadComment(current, item.id, (entry) => ({
                  ...entry,
                  ...next,
                })),
              );
            }}
          />
        </View>
        <View style={styles.commentActions}>
          {replyEnabled ? (
            <TextActionPressable
              style={styles.commentAction}
              onPress={() => openReplyComposer(item)}
              accessibilityLabel={`${item.authorLabel || "작성자"}에게 답글 달기`}
              hitSlop={spacing.sm}
            >
              <Text style={styles.replyLabel}>답글 달기</Text>
            </TextActionPressable>
          ) : null}
          {item.canDelete ? (
            <TextActionPressable
              style={styles.commentAction}
              onPress={() => confirmDelete(item)}
              accessibilityLabel="댓글 삭제"
              hitSlop={spacing.sm}
            >
              <Text style={styles.deleteLabel}>삭제</Text>
            </TextActionPressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <CommentThreadFrame
      page={page}
      dirty={Boolean(commentText.trim() || replyText.trim())}
      busy={submitting || replySubmitting}
      visible={visible}
      onClose={onClose}
      overlay={
        moderationTarget ? (
          <CommentModerationOverlay
            anchor={moderationTarget.anchor}
            authorLabel={moderationTarget.item.authorLabel || "작성자"}
            dateLabel={formatCommentDate(moderationTarget.item.createdAt)}
            content={moderationTarget.item.content}
            likeCount={moderationTarget.item.likeCount ?? 0}
            onClose={() => setModerationTarget(null)}
            onHide={() => void quickHideComment(moderationTarget.item)}
            onReport={() => confirmReportComment(moderationTarget.item)}
          />
        ) : null
      }
    >
      {!page ? (
        <Text style={styles.title} accessibilityRole="header">
          댓글
        </Text>
      ) : null}

      {viewer === "parent" ? (
        <Text style={styles.familyThreadTitle} accessibilityRole="header">
          가족 댓글
        </Text>
      ) : !feedResource ? (
        <View style={[styles.tabsInset, page && styles.pageTabsInset]}>
          <ContentTabs accessibilityLabel="댓글 범위">
            <ContentTab
              selected={audience === "public"}
              onPress={() => selectAudience("public")}
              accessibilityLabel="우리반 댓글"
            >
              우리반
            </ContentTab>
            <ContentTab
              selected={audience === "guardian"}
              onPress={() => selectAudience("guardian")}
              accessibilityLabel="가족 댓글"
            >
              가족
            </ContentTab>
          </ContentTabs>
        </View>
      ) : null}

      <View style={styles.flex}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {error ? (
              <View
                style={[
                  styles.errorBlock,
                  isFamilyAccessNotice && styles.familyNoticeBlock,
                ]}
              >
                <Text
                  style={[
                    styles.errorText,
                    isFamilyAccessNotice && styles.familyNoticeText,
                  ]}
                >
                  {error}
                </Text>
                {!isFamilyAccessNotice ? (
                  <AppButton
                    variant="quiet"
                    onPress={() =>
                      void (retryWrite === "comment"
                        ? submitComment()
                        : retryWrite === "reply"
                          ? submitReply()
                          : loadComments(audience))
                    }
                  >
                    다시 시도
                  </AppButton>
                ) : null}
              </View>
            ) : null}
            {!error && items.length === 0 ? (
              <Text style={styles.emptyText}>
                아직{" "}
                {viewer === "parent"
                  ? "가족 댓글"
                  : commentAudienceLabel(audience)}
                이 없어요
              </Text>
            ) : null}
            {items.map((root) => (
              <View key={root.id} style={styles.thread}>
                {renderCommentItem(root, false)}
                {(root.replies ?? []).map((reply) =>
                  renderCommentItem(reply, true),
                )}
                {replyTarget?.rootId === root.id ? (
                  <View style={styles.replyComposer}>
                    <Text style={styles.replyTargetLabel} numberOfLines={1}>
                      {replyTarget.authorLabel}에게 답글
                    </Text>
                    <View style={styles.replyComposerRow}>
                      <TextField
                        value={replyText}
                        onChangeText={setReplyText}
                        placeholder="답글을 입력하세요"
                        maxLength={1000}
                        editable={!replySubmitting}
                        autoFocus
                        style={styles.replyInput}
                        onSubmitEditing={() => void submitReply()}
                      />
                      <AppButton
                        onPress={() => void submitReply()}
                        disabled={!replyText.trim() || replySubmitting}
                        loading={replySubmitting}
                        style={styles.replySubmitButton}
                      >
                        등록
                      </AppButton>
                    </View>
                    <TextActionPressable
                      style={styles.replyCancel}
                      onPress={() => {
                        setReplyTarget(null);
                        setReplyText("");
                      }}
                      accessibilityLabel="답글 작성 취소"
                    >
                      <Text style={styles.replyCancelLabel}>취소</Text>
                    </TextActionPressable>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
        {canComposeComment(viewer, audience) &&
        (viewer !== "parent" || guardianAvailable) &&
        (viewer !== "student" ||
          audience !== "guardian" ||
          guardianAvailable) ? (
          <View style={styles.composer}>
            <TextField
              value={commentText}
              onChangeText={setCommentText}
              placeholder={`${commentAudienceLabel(audience)}을 입력하세요`}
              maxLength={1000}
              multiline={page}
              editable={!submitting}
              onFocus={() => setModerationTarget(null)}
              style={styles.commentInput}
            />
            <AppButton
              onPress={() => void submitComment()}
              disabled={!commentText.trim() || submitting || !cardId}
              loading={submitting}
              style={styles.submitButton}
            >
              등록
            </AppButton>
          </View>
        ) : null}
      </View>
      <FeedbackToast notice={rewardFeedback.notice} />
    </CommentThreadFrame>
  );
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
