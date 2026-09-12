import { StyleSheet, Text, View } from "react-native";
import {
  omokOutcomeReason,
  omokOutcomeTitle,
  omokRematchMessage,
} from "../../../lib/omok-presentation";
import type { OmokSnapshot } from "../../../lib/omok-contract";
import { omokTokens, radii, spacing, typography } from "../../../theme/tokens";
import { AppButton } from "../../ui";

/** Result, leave, and a host-only rematch. Board input is already locked by the
 * state machine once the room is finished. */
export function OmokTerminalPanel({
  snapshot,
  busy,
  canRematch,
  onLeave,
  onRematch,
}: {
  snapshot: OmokSnapshot;
  busy: boolean;
  canRematch: boolean;
  onLeave: () => void;
  onRematch: () => void;
}) {
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <Text style={styles.kicker}>대국 결과</Text>
      <Text style={styles.title}>{omokOutcomeTitle(snapshot)}</Text>
      <Text style={styles.reason}>{omokOutcomeReason(snapshot)}</Text>
      <Text style={styles.rematchMessage}>
        {omokRematchMessage(snapshot, canRematch)}
      </Text>
      <View style={styles.actions}>
        {canRematch ? (
          <AppButton style={styles.action} disabled={busy} onPress={onRematch}>
            {busy ? "새 대국을 만드는 중…" : "다시 대국"}
          </AppButton>
        ) : null}
        <AppButton
          variant="secondary"
          style={styles.action}
          disabled={busy}
          onPress={onLeave}
        >
          나가기
        </AppButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    maxWidth: omokTokens.terminalMaxWidth,
    alignSelf: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.panelBorder,
    backgroundColor: omokTokens.panelSurface,
  },
  kicker: {
    ...typography.micro,
    color: omokTokens.statusLabel,
    textAlign: "center",
    fontWeight: "800",
  },
  title: { ...typography.display, color: omokTokens.text, textAlign: "center" },
  reason: { ...typography.body, color: omokTokens.statusHint, textAlign: "center" },
  rematchMessage: {
    ...typography.label,
    color: omokTokens.statusHint,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1, minHeight: omokTokens.confirmMinHeight },
});
