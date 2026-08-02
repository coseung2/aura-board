import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";

export type MobileGameLobbyParticipant = {
  id: string;
  name: string;
  state?: "invited" | "joined" | "ready" | "forfeited";
};

export type MobileGameLobbyProps = {
  title?: string;
  description?: string;
  participants?: readonly MobileGameLobbyParticipant[];
  capacity?: number | null;
  loading?: boolean;
  error?: string | null;
  participantMessage?: string | null;
  actions?: ReactNode;
};

function stateLabel(state: MobileGameLobbyParticipant["state"]): string {
  if (state === "ready") return "준비 완료";
  if (state === "joined") return "입장";
  if (state === "forfeited") return "나감";
  return "초대됨";
}

export function GameLobby({
  title = "게임 대기실",
  description = "참가자를 확인하고 준비가 되면 시작하세요.",
  participants = [],
  capacity,
  loading = false,
  error,
  participantMessage,
  actions,
}: MobileGameLobbyProps) {
  return (
    <View style={styles.root} accessibilityState={{ busy: loading }}>
      <Text selectable style={styles.eyebrow}>LOBBY</Text>
      <Text selectable style={styles.title}>{title}</Text>
      <Text selectable style={styles.description}>{description}</Text>
      {participantMessage ? <Text selectable style={styles.message}>{participantMessage}</Text> : null}
      {error ? <Text selectable style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : participants.length === 0 ? (
        <Text selectable style={styles.empty}>아직 입장한 참가자가 없어요.</Text>
      ) : (
        <View style={styles.list}>
          {participants.map((participant) => (
            <View style={styles.row} key={participant.id}>
              <Text selectable style={styles.name}>{participant.name}</Text>
              <Text selectable style={styles.state}>{stateLabel(participant.state)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text selectable style={styles.count}>
        {capacity == null ? `${participants.length}명` : `${participants.length}/${capacity}명`}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  eyebrow: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  message: { ...typography.body, color: colors.accentTintedText },
  error: { ...typography.body, color: colors.danger },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: 20, textAlign: "center" },
  list: { gap: spacing.sm },
  row: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderCurve: "continuous",
    backgroundColor: colors.bg,
  },
  name: { ...typography.label, color: colors.text, flexShrink: 1 },
  state: { ...typography.badge, color: colors.textMuted },
  count: { ...typography.badge, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
