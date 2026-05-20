import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../../theme/tokens";

export type StageState = "visited" | "active" | "upcoming";

interface Props {
  order: number;
  state: StageState;
  isFirst: boolean;
  isLast: boolean;
}

const NODE_SIZE = 36;
const RAIL_WIDTH = 44;
const LINE_WIDTH = 2;

/**
 * 세로 타임라인 좌측 레일 — 노드(원형 번호) + 상하 커넥터 라인.
 * 웹의 .plant-stage-rail 과 시각적으로 동일.
 */
export function StageRail({ order, state, isFirst, isLast }: Props) {
  const nodeColor =
    state === "visited"
      ? colors.plantVisited
      : state === "active"
        ? colors.plantActive
        : colors.plantUpcoming;

  const topLineColor = isFirst
    ? "transparent"
    : state === "visited" || state === "active"
      ? colors.plantVisited
      : colors.plantUpcoming;

  const bottomLineColor = isLast
    ? "transparent"
    : state === "visited"
      ? colors.plantVisited
      : colors.plantUpcoming;

  return (
    <View style={styles.rail}>
      <View style={[styles.connector, { backgroundColor: topLineColor }]} />
      <View style={[styles.node, { backgroundColor: nodeColor }]}>
        <Text style={styles.nodeText}>{order}</Text>
      </View>
      <View style={[styles.connector, { backgroundColor: bottomLineColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  connector: {
    width: LINE_WIDTH,
    flex: 1,
    minHeight: spacing.md,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
