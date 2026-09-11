import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useInputPageExit } from "../../hooks/use-input-page-exit";
import type { ObservationDTO } from "../../lib/types";
import { colors, plant, radii, spacing, typography } from "../../theme/tokens";
import { InputPage } from "../input-page";
import { AppButton, IconButton, SurfacePressable, TextField } from "../ui";

const MAX_MEMO = 500;

interface Props {
  title: string;
  initial?: ObservationDTO | null;
  onSubmit: (payload: {
    memo: string;
    images: Array<{ url: string }>;
  }) => Promise<void>;
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
  title,
  initial,
  onSubmit,
  onPickImage,
}: Props) {
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [images, setImages] = useState<Array<{ url: string }>>(
    initial?.images.map((img) => ({ url: img.url })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const exit = useInputPageExit(
    memo !== (initial?.memo ?? "") ||
      JSON.stringify(images.map((image) => image.url)) !==
        JSON.stringify(initial?.images.map((image) => image.url) ?? []),
    busy,
  );

  const handleAddImage = useCallback(async () => {
    if (busy) return;
    if (images.length >= plant.editorImageLimit) {
      Alert.alert(
        `최대 ${plant.editorImageLimit}장`,
        `사진은 최대 ${plant.editorImageLimit}장까지 추가할 수 있어요.`,
      );
      return;
    }
    setBusy(true);
    try {
      const url = await onPickImage();
      if (url) {
        setImages((prev) => [...prev, { url }]);
      }
    } catch {
      Alert.alert("오류", "이미지를 가져오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }, [busy, images.length, onPickImage]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    if (!memo.trim() && images.length === 0) {
      Alert.alert("내용 필요", "메모 또는 사진을 1개 이상 추가해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ memo: memo.trim(), images });
      exit.finish();
    } catch (e) {
      Alert.alert(
        "저장 실패",
        (e as Error).message ?? "관찰 기록을 저장하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }, [memo, images, onSubmit]);

  return (
    <InputPage title={title} onBack={exit.back}>
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          style={styles.memoInput}
          placeholder="관찰한 내용을 적어 주세요..."
          value={memo}
          onChangeText={setMemo}
          multiline
          textAlignVertical="top"
          maxLength={MAX_MEMO}
          editable={!busy}
        />
        <Text style={styles.charCount}>
          {memo.length}/{MAX_MEMO}
        </Text>

        <View style={styles.imageGrid}>
          {images.map((img, idx) => (
            <View key={`img-${idx}`} style={styles.imageWrap}>
              <Image
                source={{ uri: img.url }}
                style={styles.imageThumb}
                resizeMode="cover"
              />
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
          <Text style={styles.maxNotice}>
            최대 {plant.editorImageLimit}장까지 추가할 수 있어요.
          </Text>
        )}
        <AppButton onPress={handleSubmit} loading={busy}>
          저장하기
        </AppButton>
      </ScrollView>
    </InputPage>
  );
}

const styles = StyleSheet.create({
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
