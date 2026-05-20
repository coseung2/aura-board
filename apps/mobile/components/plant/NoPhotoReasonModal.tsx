import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../../theme/tokens";

interface Props {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
  busy: boolean;
}

const PRESETS = [
  "날씨가 안 좋아서 사진을 못 찍었어요",
  "카메라가 고장났어요",
  "변화가 아직 없어요",
  "기타",
];

/**
 * 사진 없이 다음 단계로 진행할 때 사유를 선택하는 모달.
 * 웹의 NoPhotoReasonModal 과 동일한 UX.
 */
export function NoPhotoReasonModal({ visible, onCancel, onSubmit, busy }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [customReason, setCustomReason] = useState("");

  const isCustom = selected === PRESETS.length - 1;
  const reason = isCustom ? customReason.trim() : selected !== null ? PRESETS[selected] : "";
  const canSubmit = reason.length > 0 && !busy;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await onSubmit(reason);
  }, [canSubmit, reason, onSubmit]);

  const handleShow = useCallback(() => {
    setSelected(null);
    setCustomReason("");
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={handleShow}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>사진 없이 넘어갈까요?</Text>
          <Text style={styles.subtitle}>
            현재 단계에 사진이 없어요. 사유를 선택해 주세요.
          </Text>

          {/* 프리셋 라디오 */}
          {PRESETS.map((preset, idx) => (
            <Pressable
              key={`preset-${idx}`}
              style={[styles.option, selected === idx && styles.optionSelected]}
              onPress={() => setSelected(idx)}
            >
              <View style={[styles.radio, selected === idx && styles.radioActive]} />
              <Text style={styles.optionText}>{preset}</Text>
            </Pressable>
          ))}

          {/* 기타 입력 */}
          {isCustom && (
            <TextInput
              style={styles.customInput}
              placeholder="사유를 적어 주세요..."
              placeholderTextColor={colors.textFaint}
              value={customReason}
              onChangeText={setCustomReason}
              maxLength={200}
              editable={!busy}
            />
          )}

          {/* 버튼 */}
          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, !canSubmit && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>계속</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 400,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.plantActive,
    backgroundColor: "rgba(39, 163, 95, 0.05)",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioActive: {
    borderColor: colors.plantActive,
    backgroundColor: colors.plantActive,
  },
  optionText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  customInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.btn,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  btnRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    ...typography.label,
    color: colors.textMuted,
  },
  submitBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.btn,
    backgroundColor: colors.plantActive,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...typography.label,
    color: "#ffffff",
  },
});
