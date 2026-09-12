import { StyleSheet, Text, View } from "react-native";
import { omokSlotLabel, type OmokTurnBanner } from "../../../lib/omok-presentation";
import type { OmokSnapshot } from "../../../lib/omok-contract";
import { omokTokens, radii, spacing, typography } from "../../../theme/tokens";

/** Compact identity row: stone colour, name, whose turn it is. No version or
 * internal sync copy. */
export function OmokHud({ snapshot }: { snapshot: OmokSnapshot }) {
  return (
    <View style={styles.hud} accessibilityRole="summary">
      {snapshot.participants.map((participant) => {
        const isViewer = participant.slot === snapshot.viewer.slot;
        const isTurn =
          snapshot.roomStatus === "active" && participant.slot === snapshot.game.nextTurn;
        return (
          <View
            key={participant.slot}
            style={[styles.player, isTurn ? styles.playerActive : null]}
            accessibilityLabel={`${omokSlotLabel(participant.slot)} ${participant.displayName}${
              isViewer ? ", 나" : ""
            }${isTurn ? ", 현재 차례" : ""}`}
          >
            <View
              style={[
                styles.stone,
                participant.slot === "first" ? styles.blackStone : styles.whiteStone,
              ]}
            />
            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={1}>
                {participant.displayName}
                {isViewer ? " (나)" : ""}
              </Text>
              <View style={styles.meta}>
                <Text style={styles.slot}>{omokSlotLabel(participant.slot)}</Text>
                {isTurn ? (
                  <View style={styles.turnBadge}>
                    <Text style={styles.turnBadgeText}>차례</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The strongest turn signal, placed directly above the board. */
export function OmokTurnBar({ banner }: { banner: OmokTurnBanner }) {
  const mine = banner.emphasis === "mine";
  const peer = banner.emphasis === "peer";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.turnBar,
        mine ? styles.turnBarMine : peer ? styles.turnBarPeer : styles.turnBarNeutral,
      ]}
    >
      <Text style={[styles.turnText, mine ? styles.turnTextMine : styles.turnTextPeer]}>
        {banner.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: omokTokens.hudMinHeight,
  },
  player: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.hudBorder,
    backgroundColor: omokTokens.hudSurface,
    overflow: "hidden",
  },
  /** The visible badge carries turn ownership without relying on colour. */
  playerActive: {
    borderColor: omokTokens.myTurnSurface,
    borderWidth: omokTokens.lastMoveBorderWidth,
  },
  stone: {
    width: omokTokens.hudStoneSize,
    height: omokTokens.hudStoneSize,
    borderRadius: radii.pill,
  },
  blackStone: { backgroundColor: omokTokens.blackStone },
  whiteStone: {
    backgroundColor: omokTokens.whiteStone,
    borderWidth: omokTokens.hudStoneBorderWidth,
    borderColor: omokTokens.whiteStoneBorder,
  },
  identity: { flex: 1, minWidth: spacing.none },
  name: { ...typography.label, color: omokTokens.text },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  slot: { ...typography.micro, color: omokTokens.statusLabel, fontWeight: "800" },
  turnBadge: {
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: omokTokens.turnBadgeSurface,
  },
  turnBadgeText: {
    ...typography.micro,
    color: omokTokens.turnBadgeText,
    fontWeight: "800",
  },
  turnBar: {
    minHeight: omokTokens.turnBarMinHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
  },
  turnBarMine: { backgroundColor: omokTokens.myTurnSurface },
  turnBarPeer: { backgroundColor: omokTokens.peerTurnSurface },
  turnBarNeutral: {
    backgroundColor: omokTokens.hudSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.hudBorder,
  },
  turnText: { ...typography.title },
  turnTextMine: { color: omokTokens.myTurnText },
  turnTextPeer: { color: omokTokens.peerTurnText },
});
