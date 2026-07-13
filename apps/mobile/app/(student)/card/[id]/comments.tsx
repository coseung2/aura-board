import { useCallback, useEffect, useState } from "react";
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
import { AppButton, AppHeader, ControlPressable, TextField } from "../../../../components/ui";
import { apiFetch, ApiError } from "../../../../lib/api";
import { clearSessionToken } from "../../../../lib/session";
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

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  authorKind: "teacher" | "student" | "external";
  authorLabel: string;
  canDelete: boolean;
};

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
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) {
        return false;
      }
      await clearSessionToken();
      router.replace("/(student)/login");
      return true;
    },
    [router],
  );

  const loadComments = useCallback(
    async (refresh = false) => {
      if (!cardId) {
        setError("댓글을 열 게시글을 찾을 수 없어요.");
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
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
        setRefreshing(false);
      }
    },
    [cardId, handleAuthError],
  );

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

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
      const nextItem = response.item ?? response.comment;
      if (!nextItem) throw new Error("missing comment");
      setItems((current) => [nextItem, ...current]);
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
      setItems((current) => current.filter((item) => item.id !== commentId));
      setError(null);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("댓글을 삭제하지 못했어요.");
    }
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
            <View style={styles.composer}>
              <TextField
                value={commentText}
                onChangeText={setCommentText}
                placeholder="댓글을 입력하세요"
                multiline
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
                댓글 달기
              </AppButton>
            </View>

            {error ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>{error}</Text>
                <AppButton variant="quiet" onPress={() => void loadComments()}>
                  다시 시도
                </AppButton>
              </View>
            ) : null}

            {!error && items.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>아직 댓글이 없어요.</Text>
              </View>
            ) : (
              <View style={styles.commentList}>
                {items.map((item) => (
                  <View key={item.id} style={styles.commentItem}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor} numberOfLines={1}>
                        {item.authorLabel || "작성자"}
                      </Text>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentDate}>
                          {formatCommentDate(item.createdAt)}
                        </Text>
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
                    </View>
                    <Text style={styles.commentContent}>{item.content}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
  commentList: {
    gap: spacing.none,
  },
  commentItem: {
    minHeight: tapMin,
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  commentAuthor: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  commentDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
  commentContent: {
    ...typography.body,
    color: colors.text,
  },
  deleteButton: {
    minHeight: tapMin,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  deleteLabel: {
    ...typography.micro,
    color: colors.danger,
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
