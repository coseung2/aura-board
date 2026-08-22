import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  borders,
  colors,
  feed,
  controls,
  loadingUx,
  pageChrome,
  radii,
  slimeUi,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";

type LoadingFrameProps = {
  accessibilityLabel: string;
  children: ReactNode;
};

function LoadingFrame({ accessibilityLabel, children }: LoadingFrameProps) {
  return (
    <View
      style={styles.frame}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
    >
      <View importantForAccessibility="no-hide-descendants">{children}</View>
    </View>
  );
}

function FeedCardSkeleton() {
  return (
    <View style={styles.feedCard}>
      <View style={styles.feedHeader}>
        <View style={styles.feedHeaderCopy}>
          <View style={styles.lineMedium} />
        </View>
        <View style={styles.scopeBadge} />
      </View>
      <View style={styles.feedMedia} />
      <View style={styles.feedCopy}>
        <View style={styles.lineWide} />
        <View style={styles.lineMedium} />
        <View style={styles.lineShort} />
      </View>
    </View>
  );
}

export function StudentHomeSkeleton() {
  return (
    <LoadingFrame accessibilityLabel="홈 내용을 준비하는 중">
      <View style={styles.dailyGamePanel}>
        <View style={styles.dailyGameHeader}>
          <View style={styles.headerHalf} />
          <View style={styles.headerHalf} />
        </View>
        <View style={styles.dailyGameBody}>
          <View style={styles.petPane} />
          <View style={styles.rewardList}>
            {Array.from({ length: 4 }, (_, index) => (
              <View key={index} style={styles.rewardRow} />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.sectionHeading} />
      <View style={styles.walletCard}>
        <View style={styles.sectionLine} />
        <View style={styles.balanceRow}>
          <View style={styles.lineMedium} />
          <View style={styles.balanceValue} />
        </View>
      </View>
      <View style={styles.sectionHeading} />
      <View style={styles.assignmentFilterRow}>
        <View style={styles.filterChipSmall} />
        <View style={styles.filterChipSmall} />
      </View>
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={styles.assignmentRow} />
      ))}
    </LoadingFrame>
  );
}

export function BoardListSkeleton() {
  return (
    <LoadingFrame accessibilityLabel="보드 목록을 준비하는 중">
      <View style={styles.filterRow}>
        <View style={styles.filterChip} />
        <View style={styles.filterChip} />
        <View style={styles.filterChip} />
        <View style={styles.filterChipNarrow} />
        <View style={styles.filterChipNarrow} />
      </View>
      <View style={styles.boardTileGrid}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={styles.boardTile}>
            <View style={styles.boardThumbnail} />
            <View style={styles.boardTileBody}>
              <View style={styles.lineMedium} />
              <View style={styles.lineShort} />
            </View>
          </View>
        ))}
      </View>
    </LoadingFrame>
  );
}

export function BoardDetailSkeleton() {
  return (
    <LoadingFrame accessibilityLabel="보드 내용을 준비하는 중">
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} style={styles.boardDetailCard} />
      ))}
    </LoadingFrame>
  );
}

export function FeedListSkeleton() {
  return (
    <LoadingFrame accessibilityLabel="게시물을 준비하는 중">
      <FeedCardSkeleton />
      <FeedCardSkeleton />
    </LoadingFrame>
  );
}

export function FeedLoadMoreSkeleton() {
  return (
    <View
      style={styles.loadMoreFrame}
      accessibilityRole="progressbar"
      accessibilityLabel="이전 게시물을 불러오는 중"
      accessibilityState={{ busy: true }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <FeedCardSkeleton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  loadMoreFrame: {
    width: "100%",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.lg,
  },
  dailyGamePanel: { gap: spacing.none },
  dailyGameHeader: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  headerHalf: {
    flex: 1,
    height: loadingUx.lineHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  dailyGameBody: {
    minHeight: slimeUi.homePetSceneHeight + spacing.lg * 2,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  petPane: { width: "46%", borderRadius: radii.card, backgroundColor: colors.surfaceAlt },
  rewardList: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: spacing.xs,
  },
  rewardRow: {
    height: tapMin - spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  sectionHeading: {
    width: "34%",
    height: loadingUx.lineHeight,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  walletCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  sectionLine: {
    width: "28%",
    height: loadingUx.lineHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  balanceValue: {
    width: "32%",
    height: typography.subtitle.lineHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  assignmentFilterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterChipSmall: {
    width: tapMin + spacing.xl,
    height: controls.compactChipHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  assignmentRow: {
    height: tapMin,
    marginBottom: spacing.xs,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  filterRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  filterChip: {
    flex: 1,
    maxWidth: tapMin + spacing.xxxl,
    height: controls.compactChipHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  filterChipNarrow: {
    width: tapMin + spacing.xs,
    height: controls.compactChipHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  boardTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  boardTile: {
    width: "49%",
    gap: spacing.xxs,
  },
  boardThumbnail: {
    aspectRatio: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  boardTileBody: { gap: spacing.xxs },
  boardDetailCard: {
    height: loadingUx.boardDetailCardHeight,
    marginBottom: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  feedCard: {
    overflow: "hidden",
    marginBottom: spacing.xl,
    borderRadius: radii.card,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  feedHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  scopeBadge: {
    width: tapMin + spacing.sm,
    height: loadingUx.lineSmallHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  feedHeaderCopy: { flex: 1, gap: spacing.sm },
  feedMedia: { height: feed.mediaHeight, backgroundColor: colors.surfaceAlt },
  feedCopy: { gap: spacing.sm, padding: spacing.lg },
  lineWide: {
    width: "78%",
    height: loadingUx.lineHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  lineMedium: {
    width: "58%",
    height: loadingUx.lineHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  lineShort: {
    width: "38%",
    height: loadingUx.lineSmallHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
});
