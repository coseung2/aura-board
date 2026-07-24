import { StyleSheet, Text, View } from "react-native";
import {
  colors,
  dj,
  pageChrome,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import type { QueueRankingItem } from "./dj-queue-state";

export function DJQueueRanking({
  items,
  hidden = false,
  title = "신청 TOP",
  countUnit = "곡",
  hiddenText = "익명 보드에서는 신청자 순위를 숨겨요.",
  emptyText = "아직 신청 기록이 없어요.",
}: {
  items: QueueRankingItem[];
  hidden?: boolean;
  title?: string;
  countUnit?: string;
  hiddenText?: string;
  emptyText?: string;
}) {
  return (
    <View style={[styles.section, !title && styles.sectionFlush]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {hidden ? (
        <Text style={styles.empty}>{hiddenText}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.row}>
            <Text style={[styles.position, index < 3 && styles.positionTop]}>
              {index + 1}
            </Text>
            <View
              style={[styles.avatar, index === 0 && styles.avatarTop]}
              accessibilityLabel={`${item.name}`}
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
            <Text style={styles.count}>
              {item.count}
              {countUnit}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: pageChrome.horizontalPadding,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.none,
  },
  sectionFlush: {
    marginHorizontal: spacing.none,
    marginTop: spacing.none,
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
