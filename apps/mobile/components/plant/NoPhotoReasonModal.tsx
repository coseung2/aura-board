import { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { borders, colors, controls, plant, radii, spacing, typography } from "../../theme/tokens";
import { AppButton, AppModal, ControlPressable, TextField } from "../ui";

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
    <AppModal
      visible={visible}
      animationType="fade"
      onClose={onCancel}
      onShow={handleShow}
      sheetStyle={styles.modal}
      backdropStyle={styles.backdrop}
      accessibilityLabel="사진 없이 넘어가기 사유 선택"
    >
      <Text style={styles.title}>사진 없이 넘어갈까요?</Text>
      <Text style={styles.subtitle}>
        현재 단계에 사진이 없어요. 사유를 선택해 주세요.
      </Text>

      {PRESETS.map((preset, idx) => (
        <ControlPressable
          key={`preset-${idx}`}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === idx }}
          style={[styles.option, selected === idx && styles.optionSelected]}
          onPress={() => setSelected(idx)}
        >
          <View style={[styles.radio, selected === idx && styles.radioActive]} />
          <Text style={styles.optionText}>{preset}</Text>
        </ControlPressable>
      ))}

      {isCustom && (
        <TextField
          style={styles.customInput}
          placeholder="사유를 적어 주세요..."
          value={customReason}
          onChangeText={setCustomReason}
          maxLength={200}
          editable={!busy}
        />
      )}

      <View style={styles.btnRow}>
        <AppButton
          variant="secondary"
          style={styles.actionBtn}
          textStyle={styles.cancelText}
          onPress={onCancel}
          disabled={busy}
        >
          취소
        </AppButton>
        <AppButton
          variant="success"
          style={styles.actionBtn}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={busy}
        >
          계속
        </AppButton>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    padding: spacing.lg,
  },
  modal: {
    padding: spacing.xl,
    maxWidth: plant.noPhotoReasonMaxWidth,
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
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.plantActive,
    backgroundColor: colors.plantActiveTintedBg,
  },
  radio: {
    width: controls.radioSize,
    height: controls.radioSize,
    borderRadius: radii.pill,
    borderWidth: borders.medium,
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
    padding: spacing.md,
  },
  btnRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: { flex: 1 },
  cancelText: {
    ...typography.label,
    color: colors.textMuted,
  },
});
