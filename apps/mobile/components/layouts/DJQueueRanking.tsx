import { StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  dj,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import type { QueueRankingItem } from "./dj-queue-state";

export function DJQueueRanking({
  items,
  hidden = false,
}: {
  items: QueueRankingItem[];
  hidden?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>신청 TOP</Text>
      {hidden ? (
        <Text style={styles.empty}>익명 보드에서는 신청자 순위를 숨겨요.</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>아직 신청 기록이 없어요.</Text>
      ) : (
        items.map((item, index) => (
          <View key={item.name} style={styles.row}>
            <Text style={[styles.position, index < 3 && styles.positionTop]}>
              {index + 1}
            </Text>
            <View
              style={[styles.avatar, index === 0 && styles.avatarTop]}
              accessibilityLabel={`${item.name} 신청자`}
            >
              <Text
                style={[styles.avatarText, index === 0 && styles.avatarTextTop]}
              >
                {item.name[0]}
              </Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.count}>{item.count}곡</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  title: { ...typography.section, color: colors.text },
  empty: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  position: {
    width: dj.rankingPositionWidth,
    textAlign: "center",
    ...typography.label,
    fontFamily: "monospace",
    color: colors.textMuted,
  },
  positionTop: { color: colors.rankingGold },
  avatar: {
    width: dj.rankingAvatarSize,
    height: dj.rankingAvatarSize,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTop: { backgroundColor: colors.rankingGold },
  avatarText: { ...typography.micro, color: colors.text },
  avatarTextTop: { color: colors.onAccent },
  name: { flex: 1, ...typography.body, color: colors.text },
  count: {
    ...typography.body,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
});
