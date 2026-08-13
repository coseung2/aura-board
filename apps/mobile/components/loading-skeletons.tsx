import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  borders,
  colors,
  loadingUx,
  pageChrome,
  radii,
  spacing,
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
        <View style={styles.avatar} />
        <View style={styles.feedHeaderCopy}>
          <View style={styles.lineMedium} />
          <View style={styles.lineTiny} />
        </View>
      </View>
      <View style={styles.feedMedia} />
      <View style={styles.feedCopy}>
        <View style={styles.lineWide} />
        <View style={styles.lineMedium} />
      </View>
    </View>
  );
}

export function StudentHomeSkeleton() {
  return (
    <LoadingFrame accessibilityLabel="홈 내용을 준비하는 중">
      <View style={styles.homeHero}>
        <View style={styles.homeHeroCopy}>
          <View style={styles.lineMedium} />
          <View style={styles.lineWide} />
          <View style={styles.lineShort} />
        </View>
        <View style={styles.homePet} />
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metricCard} />
        <View style={styles.metricCard} />
        <View style={styles.metricCard} />
      </View>
      <View style={styles.sectionHeading} />
      <View style={styles.homeBoardRow} />
      <View style={styles.homeBoardRow} />
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
      </View>
      <View style={styles.boardGridRow}>
        <View style={styles.boardCard} />
        <View style={styles.boardCard} />
      </View>
      <View style={styles.boardGridRow}>
        <View style={styles.boardCard} />
        <View style={styles.boardCard} />
      </View>
    </LoadingFrame>
  );
}

export function BoardDetailSkeleton() {
  return (
    <LoadingFrame accessibilityLabel="보드 내용을 준비하는 중">
      <View style={styles.boardDetailHero}>
        <View style={styles.lineMedium} />
        <View style={styles.lineShort} />
      </View>
      <View style={styles.boardDetailCard} />
      <View style={styles.boardDetailCard} />
      <View style={styles.boardDetailCardShort} />
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
  homeHero: {
    minHeight: loadingUx.homeHeroHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  homeHeroCopy: { flex: 1, gap: spacing.md },
  homePet: {
    width: "36%",
    height: "78%",
    borderRadius: radii.card,
    backgroundColor: colors.border,
  },
  metricRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  metricCard: {
    flex: 1,
    minHeight: loadingUx.homeMetricHeight,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
  },
  sectionHeading: {
    width: "34%",
    height: loadingUx.lineHeight,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  homeBoardRow: {
    height: loadingUx.homeMetricHeight,
    marginBottom: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  filterRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  filterChip: {
    width: "26%",
    height: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  boardGridRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  boardCard: {
    flex: 1,
    height: loadingUx.boardCardHeight,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  boardDetailHero: {
    minHeight: loadingUx.boardDetailHeroHeight,
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  boardDetailCard: {
    height: loadingUx.boardDetailCardHeight,
    marginBottom: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  boardDetailCardShort: {
    height: loadingUx.homeMetricHeight,
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
  avatar: {
    width: loadingUx.feedAvatarSize,
    height: loadingUx.feedAvatarSize,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  feedHeaderCopy: { flex: 1, gap: spacing.sm },
  feedMedia: { height: loadingUx.feedMediaHeight, backgroundColor: colors.surfaceAlt },
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
  lineTiny: {
    width: "28%",
    height: loadingUx.lineSmallHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
});
