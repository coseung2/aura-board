import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useInputPageExit } from "../hooks/use-input-page-exit";
import { apiFetch } from "../lib/api";
import type { BoardCard } from "../lib/types";
import { uploadMobileFile } from "../lib/upload";
import {
  borders,
  colors,
  composer,
  radii,
  spacing,
  typography,
} from "../theme/tokens";
import { useInputFeedback } from "./input-feedback-provider";
import { InputPage } from "./input-page";
import { AppButton, TextField } from "./ui";

// 카드 작성 모달. 제목 + 본문 + 이미지/파일 첨부.
// POST /api/cards 는 이미 학생 bearer 를 받으니 그대로 사용.

type Props = {
  initialCard?: BoardCard;
  boardId: string;
  sectionId?: string | null;
  order?: number;
  onCreated: (card: BoardCard) => void;
};

type UploadResult = {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

export function CardComposer({
  initialCard,
  boardId,
  sectionId,
  order,
  onCreated,
}: Props) {
  const notify = useInputFeedback();
  const [title, setTitle] = useState(initialCard?.title ?? "");
  const [content, setContent] = useState(initialCard?.content ?? "");
  const [linkUrl, setLinkUrl] = useState(initialCard?.linkUrl ?? "");
  const [image, setImage] = useState<UploadResult | null>(null);
  const [file, setFile] = useState<UploadResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const exit = useInputPageExit(
    Boolean(
      title !== (initialCard?.title ?? "") ||
      content !== (initialCard?.content ?? "") ||
      linkUrl !== (initialCard?.linkUrl ?? "") ||
      image ||
      file,
    ),
    submitting,
  );

  function reset() {
    setTitle("");
    setContent("");
    setLinkUrl("");
    setImage(null);
    setFile(null);
  }

  async function uploadAsset(
    uri: string,
    name: string,
    mime: string,
  ): Promise<UploadResult> {
    const body = await uploadMobileFile({ uri, name, mimeType: mime });
    return {
      url: body.url,
      fileName: body.name,
      fileSize: body.size,
      mimeType: body.mimeType,
    };
  }

  async function handlePickImage() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("권한 필요", "사진 선택 권한을 허용해 주세요.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const uri = asset.uri;
      const name = asset.fileName ?? `image-${Date.now()}.jpg`;
      const mime = asset.mimeType ?? "image/jpeg";
      setSubmitting(true);
      const up = await uploadAsset(uri, name, mime);
      setImage(up);
    } catch (e) {
      Alert.alert("오류", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      setSubmitting(true);
      const up = await uploadAsset(
        asset.uri,
        asset.name,
        asset.mimeType ?? "application/octet-stream",
      );
      setFile(up);
    } catch (e) {
      Alert.alert("오류", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    const normalizedLink = linkUrl.trim();
    if (
      !title.trim() &&
      !content.trim() &&
      !normalizedLink &&
      !image &&
      !file &&
      !(
        initialCard?.attachments?.length ||
        initialCard?.imageUrl ||
        initialCard?.fileUrl ||
        initialCard?.videoUrl
      )
    ) {
      Alert.alert("비어있어요", "제목·본문·링크·첨부 중 하나는 있어야 해요.");
      return;
    }
    setSubmitting(true);
    try {
      const attachments: Array<{
        kind: "image" | "file";
        url: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
      }> = [];
      if (image) {
        attachments.push({
          kind: "image",
          url: image.url,
          fileName: image.fileName,
          fileSize: image.fileSize,
          mimeType: image.mimeType,
        });
      }
      if (file) {
        attachments.push({
          kind: "file",
          url: file.url,
          fileName: file.fileName,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
        });
      }
      const payload: Record<string, unknown> = {
        boardId,
        title: title.trim() || "(제목 없음)",
        content: content.trim(),
      };
      if (sectionId) payload.sectionId = sectionId;
      if (Number.isFinite(order)) payload.order = order;
      if (normalizedLink) payload.linkUrl = normalizedLink;
      if (attachments.length) payload.attachments = attachments;
      // 이미지가 있으면 호환성을 위해 imageUrl 도 채움.
      if (image) payload.imageUrl = image.url;
      // 파일은 singleton 필드도 유지 (legacy 웹 뷰어 호환).
      if (file) {
        payload.fileUrl = file.url;
        payload.fileName = file.fileName;
        payload.fileSize = file.fileSize;
        payload.fileMimeType = file.mimeType;
      }
      const res = await apiFetch<{ card: BoardCard }>(
        initialCard
          ? `/api/cards/${encodeURIComponent(initialCard.id)}`
          : "/api/cards",
        {
          method: initialCard ? "PATCH" : "POST",
          json: initialCard
            ? {
                title: title.trim(),
                content: content.trim(),
                linkUrl: normalizedLink || null,
              }
            : payload,
        },
      );
      onCreated(res.card);
      notify(initialCard ? "게시물을 수정했어요." : "게시물을 등록했어요.");
      reset();
      exit.finish();
    } catch (e) {
      Alert.alert("오류", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <InputPage
      title={initialCard ? "게시글 수정" : "새 카드"}
      onBack={exit.back}
    >
      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formBody}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="제목"
          editable={!submitting}
        />
        <TextField
          style={styles.contentInput}
          value={content}
          onChangeText={setContent}
          placeholder="내용을 입력하세요"
          multiline
          editable={!submitting}
        />
        <TextField
          style={styles.linkInput}
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="링크 붙여넣기"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
        />

        {initialCard ? (
          initialCard.attachments?.length ? (
            <Text style={styles.sectionLabel}>
              기존 첨부파일은 유지돼요. 첨부 변경은 웹에서 할 수 있어요.
            </Text>
          ) : null
        ) : (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionLabel}>첨부</Text>
            <View style={styles.attachRow}>
              <AppButton
                variant="secondary"
                style={[styles.attachBtn, image && styles.attachBtnSelected]}
                textStyle={[
                  styles.attachText,
                  image && styles.attachTextSelected,
                ]}
                onPress={handlePickImage}
                disabled={submitting}
              >
                이미지{image ? " 선택됨" : ""}
              </AppButton>
              <AppButton
                variant="secondary"
                style={[styles.attachBtn, file && styles.attachBtnSelected]}
                textStyle={[
                  styles.attachText,
                  file && styles.attachTextSelected,
                ]}
                onPress={handlePickFile}
                disabled={submitting}
              >
                파일{file ? " 선택됨" : ""}
              </AppButton>
            </View>

            {image || file ? (
              <View style={styles.attachmentList}>
                {image ? (
                  <AttachmentRow
                    label="이미지"
                    name={image.fileName}
                    onRemove={() => setImage(null)}
                    disabled={submitting}
                  />
                ) : null}
                {file ? (
                  <AttachmentRow
                    label="파일"
                    name={file.fileName}
                    onRemove={() => setFile(null)}
                    disabled={submitting}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        <AppButton
          style={styles.submitBtn}
          onPress={handleSubmit}
          loading={submitting}
        >
          {initialCard ? "저장하기" : "등록하기"}
        </AppButton>
      </ScrollView>
    </InputPage>
  );
}

function AttachmentRow({
  label,
  name,
  onRemove,
  disabled,
}: {
  label: string;
  name: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.attachmentRow}>
      <View style={styles.attachmentInfo}>
        <Text style={styles.attachmentKind}>{label}</Text>
        <Text style={styles.attachmentName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <AppButton
        variant="quiet"
        textStyle={styles.removeAttachmentText}
        onPress={onRemove}
        disabled={disabled}
      >
        삭제
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  formScroll: {
    flex: 1,
  },
  formBody: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  titleInput: {
    ...typography.subtitle,
    backgroundColor: colors.bg,
  },
  contentInput: {
    backgroundColor: colors.bg,
    minHeight: composer.contentMinHeight,
    textAlignVertical: "top",
  },
  linkInput: {
    backgroundColor: colors.bg,
  },
  sectionGroup: {
    gap: spacing.sm,
  },
  sectionLabel: { ...typography.label, color: colors.textMuted },
  attachRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  attachBtn: {
    flex: 1,
  },
  attachBtnSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  attachText: { ...typography.label, color: colors.textMuted },
  attachTextSelected: { color: colors.accentTintedText },
  attachmentList: {
    gap: spacing.sm,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.btn,
    backgroundColor: colors.bg,
  },
  attachmentInfo: {
    flex: 1,
    minWidth: 0,
  },
  attachmentKind: { ...typography.micro, color: colors.textFaint },
  attachmentName: { ...typography.label, color: colors.text },
  removeAttachmentText: { ...typography.label, color: colors.danger },
  submitBtn: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
});
