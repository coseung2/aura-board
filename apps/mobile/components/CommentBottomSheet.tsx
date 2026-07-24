import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AppBottomSheet, AppButton, ControlPressable, TextActionPressable, TextField } from "./ui";
import { CommentLikeButton } from "./CommentLikeButton";
import { ContentTab, ContentTabs } from "./NavigationTabs";
import { apiFetch, ApiError, parentApiFetch } from "../lib/api";
import {
  canComposeComment,
  commentAudienceLabel,
  commentsPath,
  FAMILY_THREAD_PRIVATE_MESSAGE,
  initialCommentAudience,
  type CommentAudience,
  type CommentViewer,
  visibleCommentsForViewer,
} from "../lib/comment-audience";
import {
  clearParentSession,
  clearSessionToken,
  getUnifiedLoginRoute,
} from "../lib/session";
import {
  borders,
  colors,
  controls,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  audience?: CommentAudience;
  authorLabel: string;
  likeCount?: number;
  isLiked?: boolean;
  canDelete: boolean;
};

type Props = {
  cardId: string | null;
  visible: boolean;
  onClose: () => void;
  onCommentCountChange?: (change: number) => void;
  viewer?: CommentViewer;
};

export function CommentBottomSheet({
  cardId,
  visible,
  onClose,
  onCommentCountChange,
  viewer = "student",
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<CommentAudience>(() =>
    initialCommentAudience(viewer),
  );
  const [guardianAvailable, setGuardianAvailable] = useState(false);
  const requestVersion = useRef(0);

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) {
        return false;
      }
      if (viewer === "parent") await clearParentSession();
      else await clearSessionToken();
      onClose();
      router.replace(getUnifiedLoginRoute(viewer));
      return true;
    },
    [onClose, router, viewer],
  );

  const loadComments = useCallback(async (nextAudience: CommentAudience) => {
    if (!cardId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      setError(null);
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      const response = await request<{
        items: CommentItem[];
        guardianAvailable?: boolean;
      }>(
        commentsPath(cardId, nextAudience),
      );
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
        setError("가족 댓글을 열 수 없어요. 앱과 서버를 최신 버전으로 업데이트해 주세요.");
      }
    } catch (nextError) {
      if (version !== requestVersion.current) return;
      if (await handleAuthError(nextError)) return;
      setError(
        viewer === "student" && nextAudience === "guardian" &&
        nextError instanceof ApiError && nextError.status === 403
          ? FAMILY_THREAD_PRIVATE_MESSAGE
          : "댓글을 불러오지 못했어요.",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [cardId, handleAuthError, viewer]);

  useEffect(() => {
    if (!visible || !cardId) return;
    setAudience(initialCommentAudience(viewer));
    setGuardianAvailable(false);
    setCommentText("");
    void loadComments(initialCommentAudience(viewer));
    return () => {
      requestVersion.current += 1;
    };
  }, [cardId, loadComments, visible]);

  function selectAudience(nextAudience: CommentAudience) {
    if (nextAudience === audience) return;
    setAudience(nextAudience);
    setCommentText("");
    if (viewer === "student" && nextAudience === "guardian" && !guardianAvailable) {
      setItems([]);
      setError(FAMILY_THREAD_PRIVATE_MESSAGE);
      return;
    }
    void loadComments(nextAudience);
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!cardId || !content || submitting) return;
    setSubmitting(true);
    try {
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      const response = await request<{
        item?: CommentItem;
        comment?: CommentItem;
      }>(commentsPath(cardId, audience), {
        method: "POST",
        json: { content, audience },
      });
      const item = response.item ?? response.comment;
      if (!item) throw new Error("missing comment");
      if (viewer === "parent" && item.audience !== "guardian") {
        // Do not render a possibly-public response from an outdated server.
        // The composer is unavailable until guardianAvailable is confirmed,
        // but retain this boundary for malformed or cached responses too.
        setError("가족 댓글을 확인할 수 없어요. 앱과 서버를 최신 버전으로 업데이트해 주세요.");
        return;
      }
      setItems((current) => [item, ...current]);
      setCommentText("");
      setError(null);
      if (audience === "public") onCommentCountChange?.(1);
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
    if (!cardId) return;
    try {
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      await request(
        `/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      setItems((current) => current.filter((item) => item.id !== commentId));
      setError(null);
      if (audience === "public") onCommentCountChange?.(-1);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 삭제하지 못했어요.");
    }
  }

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={styles.sheet}
      accessibilityLabel="댓글"
      keyboardAvoiding
    >
      <Text style={styles.title} accessibilityRole="header">
        댓글
      </Text>

      {viewer === "parent" ? (
        <Text style={styles.familyThreadTitle} accessibilityRole="header">
          가족 댓글
        </Text>
      ) : (
        <View style={styles.tabsInset}>
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
      )}

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
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            {error ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>{error}</Text>
                <AppButton variant="quiet" onPress={() => void loadComments(audience)}>
                  다시 시도
                </AppButton>
              </View>
            ) : null}
            {!error && items.length === 0 ? (
              <Text style={styles.emptyText}>
                아직 {viewer === "parent" ? "가족 댓글" : commentAudienceLabel(audience)}이 없어요
              </Text>
            ) : null}
            {items.map((item) => (
              <View key={item.id} style={styles.commentItem}>
                <View style={styles.commentItemRow}>
                  <View style={styles.commentTextBlock}>
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
                  </View>
                  <CommentLikeButton
                    cardId={cardId ?? ""}
                    commentId={item.id}
                    likeCount={item.likeCount}
                    isLiked={item.isLiked}
                    viewer={viewer}
                    onUnauthorized={handleAuthError}
                    onChanged={(next) => {
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, ...next } : entry,
                        ),
                      );
                    }}
                  />
                </View>
                {item.canDelete ? (
                  <TextActionPressable
                    style={styles.deleteButton}
                    onPress={() => confirmDelete(item)}
                    accessibilityLabel="댓글 삭제"
                    hitSlop={spacing.sm}
                  >
                    <Text style={styles.deleteLabel}>삭제</Text>
                  </TextActionPressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
        {canComposeComment(viewer, audience) &&
        (viewer !== "parent" || guardianAvailable) &&
        (viewer !== "student" || audience !== "guardian" || guardianAvailable) ? (
          <View style={styles.composer}>
            <TextField
              value={commentText}
              onChangeText={setCommentText}
              placeholder={`${commentAudienceLabel(audience)}을 입력하세요`}
              maxLength={1000}
              editable={!submitting}
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
    </AppBottomSheet>
  );
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: "80%",
    minHeight: "52%",
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    backgroundColor: colors.bg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
    paddingBottom: spacing.md,
  },
  tabsInset: { marginHorizontal: spacing.lg },
  familyThreadTitle: {
    ...typography.label,
    color: colors.textMuted,
    marginHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  commentItem: { gap: spacing.xs },
  commentItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentTextBlock: { flex: 1, gap: spacing.xs },
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
  commentAuthor: { ...typography.label, color: colors.text, flexShrink: 1 },
  commentDate: { ...typography.micro, color: colors.textMuted },
  commentContent: { ...typography.body, color: colors.text },
  deleteButton: {
    alignSelf: "flex-start",
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
  },
  deleteLabel: { ...typography.micro, color: colors.danger },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xl,
  },
  errorBlock: { gap: spacing.xs, alignItems: "flex-start" },
  errorText: { ...typography.body, color: colors.danger },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  commentInput: { flex: 1, minHeight: controls.inputHeight },
  submitButton: { minWidth: tapMin },
});
