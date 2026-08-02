import { StyleSheet, Text, View } from "react-native";
import {
  colors,
  gamePlatform,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, AppModal } from "../ui";

export type MobileGameExitDialogProps = {
  visible: boolean;
  title?: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  disabledReason?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function GameExitDialog({
  visible,
  title = "게임에서 나갈까요?",
  description,
  confirmLabel,
  cancelLabel = "계속하기",
  busy = false,
  disabledReason,
  onConfirm,
  onCancel,
}: MobileGameExitDialogProps) {
  return (
    <AppModal
      visible={visible}
      animationType="fade"
      accessibilityLabel="게임 나가기 확인"
      closeOnBackdropPress={!busy}
      onClose={() => {
        if (!busy) onCancel();
      }}
      sheetStyle={styles.card}
    >
      <Text selectable style={styles.title}>{title}</Text>
      <Text selectable style={styles.description}>{description}</Text>
      {disabledReason ? (
        <Text selectable style={styles.disabledReason}>{disabledReason}</Text>
      ) : null}
      <View style={styles.actions}>
        <AppButton disabled={busy} onPress={onCancel} variant="secondary">
          {cancelLabel}
        </AppButton>
        <AppButton
          disabled={Boolean(disabledReason)}
          loading={busy}
          onPress={() => void onConfirm()}
          variant="danger"
        >
          {confirmLabel}
        </AppButton>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: gamePlatform.modalMaxWidth,
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: { ...typography.title, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  disabledReason: { ...typography.label, color: colors.danger },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
