import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AppButton,
  AppHeader,
  BarePressable,
  ControlPressable,
  TextField,
} from "../../../../components/ui";
import { CommentLikeButton } from "../../../../components/CommentLikeButton";
import {
  CommentModerationOverlay,
  type CommentAnchor,
} from "../../../../components/CommentModerationOverlay";
import { ContentTab, ContentTabs } from "../../../../components/NavigationTabs";
import { apiFetch, ApiError } from "../../../../lib/api";
import {
  hiddenPlaceholderText,
  hideContent,
  reportContent,
  unhideContent,
  type HiddenReason,
} from "../../../../lib/content-safety";
import {
  commentAudienceLabel,
  commentsPath,
  FAMILY_THREAD_PRIVATE_MESSAGE,
  type CommentAudience,
} from "../../../../lib/comment-audience";
import {
  appendThreadReply,
  removeThreadComment,
  updateThreadComment,
  type MobileCommentItem,
} from "../../../../lib/comment-thread";
import {
  clearSessionToken,
  getUnifiedLoginRoute,
} from "../../../../lib/session";
import {
  borders,
  colors,
  controls,
  layout,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../../../theme/tokens";

type CommentItem = MobileCommentItem;

type Params = {
  id?: string | string[];
  title?: string | string[];
};

export default function StudentCardCommentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const cardId = Array.isArray(params.id) ? params.id[0] ?? "" : params.id ?? "";
  const cardTitle = Array.isArray(params.title)
    ? params.title[0] ?? "댓글"
    : params.title ?? "댓글";
  const [items, setItems] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyTarget, setReplyTarget] = useState<{
    rootId: string;
    targetId: string;
    authorLabel: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<CommentAudience>("public");
  const [guardianAvailable, setGuardianAvailable] = useState(false);
  // Comment currently open in the report/hide sheet.
  const [moderationTarget, setModerationTarget] = useState<{
    item: CommentItem;
    anchor: CommentAnchor;
  } | null>(null);
  const commentRefs = useRef(new Map<string, View>());
  const requestVersion = useRef(0);

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) {
        return false;
      }
      await clearSessionToken();
      router.replace(getUnifiedLoginRoute("student"));
      return true;
    },
    [router],
  );

  const loadComments = useCallback(
    async (refresh = false, nextAudience: CommentAudience = audience) => {
      if (!cardId) {
        setError("댓글을 열 게시글을 찾을 수 없어요.");
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const version = ++requestVersion.current;
      try {
        setError(null);
        const response = await apiFetch<{
          items: CommentItem[];
          guardianAvailable?: boolean;
        }>(
          commentsPath(cardId, nextAudience),
        );
        if (version !== requestVersion.current) return;
        setItems(response.items ?? []);
        setGuardianAvailable(Boolean(response.guardianAvailable));
      } catch (nextError) {
        if (version !== requestVersion.current) return;
        if (await handleAuthError(nextError)) return;
        setError(
          nextAudience === "guardian" &&
          nextError instanceof ApiError && nextError.status === 403
            ? FAMILY_THREAD_PRIVATE_MESSAGE
            : "댓글을 불러오지 못했어요.",
        );
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [audience, cardId, handleAuthError],
  );

  useEffect(() => {
    void loadComments(false, audience);
    return () => {
      requestVersion.current += 1;
    };
  }, [loadComments]);

  function selectAudience(nextAudience: CommentAudience) {
    setModerationTarget(null);
    setReplyTarget(null);
    setReplyText("");
    if (nextAudience === audience) return;
    setAudience(nextAudience);
    setCommentText("");
    if (nextAudience === "guardian" && !guardianAvailable) {
      setItems([]);
      setError(FAMILY_THREAD_PRIVATE_MESSAGE);
      return;
    }
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!cardId || !content || submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch<{
        item?: CommentItem;
        comment?: CommentItem;
      }>(commentsPath(cardId, audience), {
        method: "POST",
        json: { content, audience },
      });
      const nextItem = response.item ?? response.comment;
      if (!nextItem) throw new Error("missing comment");
      setItems((current) => [{ ...nextItem, replies: [] }, ...current]);
      setCommentText("");
      setError(null);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 등록하지 못했어요.");
    } finally {
      setSubmitting(false);
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
    try {
      await apiFetch(
        `/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      setItems((current) => removeThreadComment(current, commentId));
      setError(null);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 삭제하지 못했어요.");
    }
  }

  /** Mark one comment hidden or visible in local state. */
  function applyHiddenReason(commentId: string, hiddenReason: HiddenReason | null) {
    setItems((current) =>
      updateThreadComment(current, commentId, (item) => ({ ...item, hiddenReason })),
    );
  }

  function openReplyComposer(item: CommentItem) {
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
    setReplySubmitting(true);
    try {
      const response = await apiFetch<{
        item?: CommentItem;
        comment?: CommentItem;
      }>(commentsPath(cardId, audience), {
        method: "POST",
        json: { content, audience, parentCommentId: replyTarget.targetId },
      });
      const nextItem = response.item ?? response.comment;
      if (!nextItem) throw new Error("missing reply");
      setItems((current) =>
        appendThreadReply(current, replyTarget.rootId, {
          ...nextItem,
          replies: [],
        }),
      );
      setReplyText("");
      setReplyTarget(null);
      setError(null);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("답글을 등록하지 못했어요.");
    } finally {
      setReplySubmitting(false);
    }
  }

  async function hideComment(item: CommentItem) {
    applyHiddenReason(item.id, "item");
    try {
      await hideContent({ targetKind: "comment", targetId: item.id });
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
      await unhideContent({ targetKind: "comment", targetId: item.id });
      // The content was blanked server-side while hidden, so refetch to get it.
      await loadComments(true);
    } catch (nextError) {
      applyHiddenReason(item.id, item.hiddenReason ?? "item");
      if (await handleAuthError(nextError)) return;
      setError("숨긴 댓글을 되돌리지 못했어요.");
    }
  }

  async function reportComment(
    item: CommentItem,
    input: { reason: Parameters<typeof reportContent>[0]["reason"]; detail?: string; hideAuthor: boolean },
  ) {
    const result = await reportContent({
      targetKind: "comment",
      targetId: item.id,
      reason: input.reason,
      detail: input.detail,
      hideAuthor: input.hideAuthor,
    });
    // The server hides the reported comment for the reporter.
    applyHiddenReason(item.id, result.hiddenAuthor ? "author" : "item");
    if (result.hiddenAuthor && result.authorStudentId) {
      // Everything else from that author is hidden too; refetch to reflect it.
      await loadComments(true);
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

  function renderCommentItem(item: CommentItem, isReply: boolean) {
    if (item.hiddenReason) {
      return (
        <View key={item.id} style={[styles.hiddenItem, isReply && styles.replyItem]}>
          <Text style={styles.hiddenText}>
            {hiddenPlaceholderText("comment", item.hiddenReason)}
          </Text>
          {item.hiddenReason === "item" ? (
            <ControlPressable
              style={styles.hiddenAction}
              onPress={() => void unhideComment(item)}
              accessibilityLabel="숨긴 댓글 다시 보기"
            >
              <Text style={styles.hiddenActionLabel}>다시 보기</Text>
            </ControlPressable>
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
            onLongPress={item.canModerate ? () => openModerationMenu(item) : undefined}
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
                <Text style={styles.commentDate}>{formatCommentDate(item.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.commentContent}>{item.content}</Text>
          </BarePressable>
          <CommentLikeButton
            cardId={cardId}
            commentId={item.id}
            likeCount={item.likeCount}
            isLiked={item.isLiked}
            onInteractionStart={() => setModerationTarget(null)}
            onUnauthorized={handleAuthError}
            onChanged={(next) => {
              setItems((current) =>
                updateThreadComment(current, item.id, (entry) => ({ ...entry, ...next })),
              );
            }}
          />
        </View>
        <View style={styles.commentActions}>
          <ControlPressable
            style={styles.commentAction}
            onPress={() => openReplyComposer(item)}
            accessibilityLabel={`${item.authorLabel || "작성자"}에게 답글 달기`}
          >
            <Text style={styles.replyLabel}>답글 달기</Text>
          </ControlPressable>
          {item.canDelete ? (
            <ControlPressable
              style={styles.commentAction}
              onPress={() => confirmDelete(item)}
              accessibilityLabel="댓글 삭제"
            >
              <Text style={styles.deleteLabel}>삭제</Text>
            </ControlPressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title={cardTitle} onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void loadComments(true)}
                tintColor={colors.accent}
              />
            }
          >
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

            {audience !== "guardian" || guardianAvailable ? (
              <View style={styles.composer}>
                <TextField
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={`${commentAudienceLabel(audience)}을 입력하세요`}
                  multiline
                  maxLength={1000}
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
                  댓글 달기
                </AppButton>
              </View>
            ) : null}

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
                  <AppButton variant="quiet" onPress={() => void loadComments(false, audience)}>
                    다시 시도
                  </AppButton>
                ) : null}
              </View>
            ) : null}

            {!error && items.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  아직 {commentAudienceLabel(audience)}이 없어요.
                </Text>
              </View>
            ) : (
              <View style={styles.commentList}>
                {items.map((root) => (
                  <View key={root.id} style={styles.thread}>
                    {renderCommentItem(root, false)}
                    {(root.replies ?? []).map((reply) => renderCommentItem(reply, true))}
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
                        <ControlPressable
                          style={styles.replyCancel}
                          onPress={() => {
                            setReplyTarget(null);
                            setReplyText("");
                          }}
                          accessibilityLabel="답글 작성 취소"
                        >
                          <Text style={styles.replyCancelLabel}>취소</Text>
                        </ControlPressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      {moderationTarget ? (
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
      ) : null}
    </SafeAreaView>
  );
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  composer: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  commentInput: {
    minHeight: controls.multilineInputMinHeight,
    textAlignVertical: "top",
  },
  submitButton: {
    alignSelf: "flex-start",
  },
  errorBlock: {
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  familyNoticeBlock: {
    width: "100%",
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  familyNoticeText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  commentList: {
    gap: spacing.none,
  },
  thread: {
    gap: spacing.none,
  },
  commentItem: {
    minHeight: tapMin,
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  replyItem: {
    marginLeft: spacing.xl,
    paddingLeft: spacing.md,
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.border,
  },
  commentItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentTextBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  commentIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  commentAuthor: {
    ...typography.label,
    color: colors.text,
    flexShrink: 1,
  },
  commentDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
  commentContent: {
    ...typography.body,
    color: colors.text,
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentAction: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  replyLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  deleteLabel: {
    ...typography.micro,
    color: colors.danger,
  },
  replyComposer: {
    marginLeft: spacing.xl,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.accent,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  replyTargetLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  replyComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  replyInput: {
    flex: 1,
    minHeight: controls.inputHeight,
  },
  replySubmitButton: {
    minWidth: tapMin,
  },
  replyCancel: {
    alignSelf: "flex-start",
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    backgroundColor: colors.transparent,
  },
  replyCancelLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  // Placeholder that replaces a hidden comment in place.
  hiddenItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
  },
  hiddenText: {
    ...typography.label,
    color: colors.textMuted,
    flex: 1,
  },
  hiddenAction: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  hiddenActionLabel: {
    ...typography.micro,
    color: colors.accent,
  },
  emptyState: {
    alignItems: "flex-start",
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
