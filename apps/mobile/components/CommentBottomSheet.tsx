import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, AppButton, ControlPressable, TextField } from "./ui";
import { CommentLikeButton } from "./CommentLikeButton";
import { apiFetch, ApiError } from "../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../lib/session";
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
};

export function CommentBottomSheet({
  cardId,
  visible,
  onClose,
  onCommentCountChange,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) {
        return false;
      }
      await clearSessionToken();
      onClose();
      router.replace(getUnifiedLoginRoute("student"));
      return true;
    },
    [onClose, router],
  );

  const loadComments = useCallback(async () => {
    if (!cardId) return;
    setLoading(true);
    try {
      setError(null);
      const response = await apiFetch<{ items: CommentItem[] }>(
        `/api/cards/${encodeURIComponent(cardId)}/comments`,
      );
      setItems(response.items ?? []);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [cardId, handleAuthError]);

  useEffect(() => {
    if (!visible || !cardId) return;
    setCommentText("");
    void loadComments();
  }, [cardId, loadComments, visible]);

  async function submitComment() {
    const content = commentText.trim();
    if (!cardId || !content || submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch<{
        item?: CommentItem;
        comment?: CommentItem;
      }>(`/api/cards/${encodeURIComponent(cardId)}/comments`, {
        method: "POST",
        json: { content },
      });
      const item = response.item ?? response.comment;
      if (!item) throw new Error("missing comment");
      setItems((current) => [item, ...current]);
      setCommentText("");
      setError(null);
      onCommentCountChange?.(1);
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
      await apiFetch(
        `/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      setItems((current) => current.filter((item) => item.id !== commentId));
      setError(null);
      onCommentCountChange?.(-1);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 삭제하지 못했어요.");
    }
  }

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}
      accessibilityLabel="댓글"
    >
      <Text style={styles.title} accessibilityRole="header">
        댓글
      </Text>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>{error}</Text>
                <AppButton variant="quiet" onPress={() => void loadComments()}>
                  다시 시도
                </AppButton>
              </View>
            ) : null}
            {!error && items.length === 0 ? (
              <Text style={styles.emptyText}>아직 댓글이 없어요</Text>
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
                  <ControlPressable
                    style={styles.deleteButton}
                    onPress={() => confirmDelete(item)}
                    accessibilityLabel="댓글 삭제"
                  >
                    <Text style={styles.deleteLabel}>삭제</Text>
                  </ControlPressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.composer}>
          <TextField
            value={commentText}
            onChangeText={setCommentText}
            placeholder="댓글을 입력하세요"
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
      </KeyboardAvoidingView>
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
  },
  title: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
    paddingBottom: spacing.md,
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
