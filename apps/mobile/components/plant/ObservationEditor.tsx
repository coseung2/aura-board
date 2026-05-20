import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, typography } from "../../theme/tokens";
import type { ObservationDTO } from "../../lib/types";

interface Props {
  visible: boolean;
  title: string;
  initial?: ObservationDTO | null;
  onCancel: () => void;
  onSubmit: (payload: { memo: string; images: Array<{ url: string }> }) => Promise<void>;
  onPickImage: () => Promise<string | null>;
}

const MAX_IMAGES = 10;

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

  // 모달이 열릴 때 initial 값으로 리셋
  const handleShow = useCallback(() => {
    setMemo(initial?.memo ?? "");
    setImages(initial?.images.map((img) => ({ url: img.url })) ?? []);
    setBusy(false);
  }, [initial]);

  const handleAddImage = useCallback(async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("최대 10장", "사진은 최대 10장까지 추가할 수 있어요.");
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      onShow={handleShow}
    >
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Pressable onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelBtn}>취소</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={handleSubmit} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.plantActive} />
            ) : (
              <Text style={styles.submitBtn}>저장</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* 메모 입력 */}
          <TextInput
            style={styles.memoInput}
            placeholder="관찰한 내용을 적어 주세요..."
            placeholderTextColor={colors.textFaint}
            value={memo}
            onChangeText={setMemo}
            multiline
            textAlignVertical="top"
            maxLength={1000}
            editable={!busy}
          />
          <Text style={styles.charCount}>{memo.length}/1000</Text>

          {/* 이미지 그리드 */}
          <View style={styles.imageGrid}>
            {images.map((img, idx) => (
              <View key={`img-${idx}`} style={styles.imageWrap}>
                <Image source={{ uri: img.url }} style={styles.imageThumb} resizeMode="cover" />
                <Pressable
                  style={styles.imageRemove}
                  onPress={() => handleRemoveImage(idx)}
                  disabled={busy}
                >
                  <Text style={styles.imageRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES && (
              <Pressable style={styles.addImageBtn} onPress={handleAddImage} disabled={busy}>
                <Text style={styles.addImageIcon}>📷</Text>
                <Text style={styles.addImageText}>추가</Text>
              </Pressable>
            )}
          </View>
          {images.length >= MAX_IMAGES && (
            <Text style={styles.maxNotice}>최대 10장까지 추가할 수 있어요.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
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
    fontSize: 16,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  memoInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 120,
    ...typography.body,
    color: colors.text,
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
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceAlt,
  },
  imageRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageRemoveText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  addImageBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed" as never,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.surface,
  },
  addImageIcon: {
    fontSize: 24,
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
