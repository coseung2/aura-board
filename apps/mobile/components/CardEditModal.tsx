import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  borders,
  colors,
  composer,
  spacing,
  typography,
} from "../theme/tokens";
import { apiFetch } from "../lib/api";
import type { BoardCard } from "../lib/types";
import { AppButton, AppModal, IconButton, TextField } from "./ui";

type Props = {
  card: BoardCard | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (card: BoardCard) => void;
};

/** Minimal mobile editor for a student's own board card. Attachments are retained. */
export function CardEditModal({ card, visible, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title ?? "");
    setContent(card.content ?? "");
    setLinkUrl(card.linkUrl ?? "");
  }, [card]);

  async function handleSave() {
    if (!card || submitting) return;
    const retainsExistingMedia = Boolean(
      card.imageUrl ||
      card.videoUrl ||
      card.fileUrl ||
      card.attachments?.length,
    );
    if (
      !title.trim() &&
      !content.trim() &&
      !linkUrl.trim() &&
      !retainsExistingMedia
    ) {
      Alert.alert(
        "비어있어요",
        "제목·본문·링크 또는 첨부파일 중 하나는 있어야 해요.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch<{ card: BoardCard }>(
        `/api/cards/${encodeURIComponent(card.id)}`,
        {
          method: "PATCH",
          json: {
            title: title.trim(),
            content: content.trim(),
            linkUrl: linkUrl.trim() || null,
          },
        },
      );
      onSaved(response.card);
      onClose();
    } catch (error) {
      Alert.alert(
        "수정 실패",
        error instanceof Error ? error.message : "게시글을 수정하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      sheetStyle={styles.sheet}
    >
      <View style={styles.head}>
        <Text style={styles.title}>게시글 수정</Text>
        <IconButton
          onPress={onClose}
          style={styles.closeButton}
          accessibilityLabel="닫기"
        >
          <Text style={styles.closeText}>✕</Text>
        </IconButton>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder="제목"
          editable={!submitting}
        />
        <TextField
          value={content}
          onChangeText={setContent}
          placeholder="내용을 입력하세요"
          multiline
          editable={!submitting}
          style={styles.contentInput}
        />
        <TextField
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="링크 붙여넣기"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
        />
        {card?.attachments?.length ? (
          <Text style={styles.note}>
            기존 첨부파일은 유지돼요. 첨부파일 변경은 웹에서 할 수 있어요.
          </Text>
        ) : null}
      </ScrollView>
      <AppButton
        style={styles.saveButton}
        onPress={() => void handleSave()}
        loading={submitting}
      >
        저장하기
      </AppButton>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: "100%" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  title: { ...typography.title, color: colors.text },
  closeButton: { backgroundColor: colors.surfaceAlt },
  closeText: { ...typography.subtitle, color: colors.textMuted },
  scroll: { flexShrink: 1, maxHeight: composer.formMaxHeight },
  body: { padding: spacing.xl, gap: spacing.md },
  contentInput: {
    minHeight: composer.contentMinHeight,
    textAlignVertical: "top",
  },
  note: { ...typography.micro, color: colors.textMuted },
  saveButton: { marginHorizontal: spacing.xl, marginBottom: spacing.xl },
});
