import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, ControlPressable, TextField } from "./ui";
import { apiFetch, ApiError } from "../lib/api";
import { clearSessionToken } from "../lib/session";
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
  const translateY = useRef(new Animated.Value(0)).current;
  const [items, setItems] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeSheet = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 720,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onClose();
    });
  }, [onClose, translateY]);

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) {
        return false;
      }
      await clearSessionToken();
      onClose();
      router.replace("/(student)/login");
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
    translateY.setValue(0);
    setCommentText("");
    void loadComments();
  }, [cardId, loadComments, translateY, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 4,
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 104 || gesture.vy > 0.7) {
          closeSheet();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

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
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={closeSheet}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <ControlPressable
          style={styles.backdropPressable}
          onPress={closeSheet}
          accessibilityLabel="댓글 닫기"
        >
          <View />
        </ControlPressable>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm, transform: [{ translateY }] }]}
        >
          <View style={styles.dragArea} {...panResponder.panHandlers}>
            <View style={styles.dragHandle} />
            <Text style={styles.title} accessibilityRole="header">
              댓글
            </Text>
          </View>

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
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor} numberOfLines={1}>
                        {item.authorLabel || "작성자"}
                      </Text>
                      <Text style={styles.commentDate}>
                        {formatCommentDate(item.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.commentContent}>{item.content}</Text>
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
        </Animated.View>
      </View>
    </Modal>
  );
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.modalBackdrop },
  backdropPressable: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.transparent },
  sheet: {
    maxHeight: "80%",
    minHeight: "52%",
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  dragArea: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.md },
  dragHandle: { width: spacing.xxl, height: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.borderHover },
  title: { ...typography.section, color: colors.text, marginTop: spacing.sm },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  commentItem: { gap: spacing.xs },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  commentAuthor: { ...typography.label, color: colors.text, flex: 1 },
  commentDate: { ...typography.micro, color: colors.textMuted },
  commentContent: { ...typography.body, color: colors.text },
  deleteButton: { alignSelf: "flex-start", minHeight: tapMin, justifyContent: "center" },
  deleteLabel: { ...typography.micro, color: colors.danger },
  emptyText: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.xl },
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
