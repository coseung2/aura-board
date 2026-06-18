import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { borders, colors, plant, radii, spacing, typography } from "../../theme/tokens";
import type { ObservationDTO } from "../../lib/types";
import { AppButton, AppModal, IconButton, SurfacePressable, TextField } from "../ui";

interface Props {
  visible: boolean;
  title: string;
  initial?: ObservationDTO | null;
  onCancel: () => void;
  onSubmit: (payload: { memo: string; images: Array<{ url: string }> }) => Promise<void>;
  onPickImage: () => Promise<string | null>;
}

/**
 * 관찰 기록 작성/수정 모달.
 * - 메모 입력 (TextInput, 자동 높이)
 * - 이미지 추가 (onPickImage 콜백으로 카메라/갤러리 선택)
 * - 이미지 삭제 (X 버튼)
 * - 제출 (onSubmit)
 */
export function ObservationEditor({
  visible,
  title,
  initial,
  onCancel,
  onSubmit,
  onPickImage,
}: Props) {
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [images, setImages] = useState<Array<{ url: string }>>(
    initial?.images.map((img) => ({ url: img.url })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const handleRequestClose = useCallback(() => {
    if (!busy) onCancel();
  }, [busy, onCancel]);

  // 모달이 열릴 때 initial 값으로 리셋
  const handleShow = useCallback(() => {
    setMemo(initial?.memo ?? "");
    setImages(initial?.images.map((img) => ({ url: img.url })) ?? []);
    setBusy(false);
  }, [initial]);

  const handleAddImage = useCallback(async () => {
    if (images.length >= plant.editorImageLimit) {
      Alert.alert(`최대 ${plant.editorImageLimit}장`, `사진은 최대 ${plant.editorImageLimit}장까지 추가할 수 있어요.`);
      return;
    }
    try {
      const url = await onPickImage();
      if (url) {
        setImages((prev) => [...prev, { url }]);
      }
    } catch {
      Alert.alert("오류", "이미지를 가져오지 못했어요.");
    }
  }, [images.length, onPickImage]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!memo.trim() && images.length === 0) {
      Alert.alert("내용 필요", "메모 또는 사진을 1개 이상 추가해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ memo: memo.trim(), images });
    } catch (e) {
      Alert.alert("저장 실패", (e as Error).message ?? "관찰 기록을 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }, [memo, images, onSubmit]);

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      onClose={handleRequestClose}
      onShow={handleShow}
      keyboardAvoiding
      sheetStyle={styles.container}
      accessibilityLabel={title}
    >
      <View style={styles.header}>
        <AppButton
          variant="quiet"
          textStyle={styles.cancelBtn}
          onPress={handleRequestClose}
          disabled={busy}
        >
          취소
        </AppButton>
        <Text style={styles.title}>{title}</Text>
        <AppButton
          variant="quiet"
          textStyle={styles.submitBtn}
          onPress={handleSubmit}
          disabled={busy}
          loading={busy}
        >
          저장
        </AppButton>
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          style={styles.memoInput}
          placeholder="관찰한 내용을 적어 주세요..."
          value={memo}
          onChangeText={setMemo}
          multiline
          textAlignVertical="top"
          maxLength={1000}
          editable={!busy}
        />
        <Text style={styles.charCount}>{memo.length}/1000</Text>

        <View style={styles.imageGrid}>
          {images.map((img, idx) => (
            <View key={`img-${idx}`} style={styles.imageWrap}>
              <Image source={{ uri: img.url }} style={styles.imageThumb} resizeMode="cover" />
              <IconButton
                style={styles.imageRemove}
                hitSlop={spacing.md}
                onPress={() => handleRemoveImage(idx)}
                disabled={busy}
              >
                <Text style={styles.imageRemoveText}>✕</Text>
              </IconButton>
            </View>
          ))}
          {images.length < plant.editorImageLimit && (
            <SurfacePressable
              style={styles.addImageBtn}
              onPress={handleAddImage}
              disabled={busy}
            >
              <Text style={styles.addImageIcon}>📷</Text>
              <Text style={styles.addImageText}>추가</Text>
            </SurfacePressable>
          )}
        </View>
        {images.length >= plant.editorImageLimit && (
          <Text style={styles.maxNotice}>최대 {plant.editorImageLimit}장까지 추가할 수 있어요.</Text>
        )}
      </ScrollView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: plant.editorModalMaxWidth,
    maxHeight: plant.editorModalMaxHeight,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelBtn: {
    ...typography.body,
    color: colors.textMuted,
  },
  title: {
    ...typography.section,
    color: colors.text,
  },
  submitBtn: {
    ...typography.label,
    color: colors.plantActive,
  },
  bodyScroll: {
    flexShrink: 1,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  memoInput: {
    padding: spacing.lg,
    minHeight: plant.editorMemoMinHeight,
    backgroundColor: colors.surface,
  },
  charCount: {
    ...typography.micro,
    color: colors.textFaint,
    textAlign: "right",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  imageWrap: {
    position: "relative",
    width: plant.editorImageSize,
    height: plant.editorImageSize,
    borderRadius: radii.btn,
    overflow: "hidden",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceAlt,
  },
  imageRemove: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: plant.editorRemoveSize,
    height: plant.editorRemoveSize,
    minHeight: plant.editorRemoveSize,
    backgroundColor: colors.overlay,
  },
  imageRemoveText: {
    color: colors.onAccent,
    ...typography.badge,
    fontWeight: "700",
  },
  addImageBtn: {
    width: plant.editorImageSize,
    height: plant.editorImageSize,
    borderRadius: radii.btn,
    borderStyle: "dashed" as never,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  addImageIcon: {
    ...typography.title,
  },
  addImageText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  maxNotice: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
});
