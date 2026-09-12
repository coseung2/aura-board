import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import {
  OMOK_BOARD_SIZE,
  nearestOmokIntersection,
  omokCoordinateLabel,
  omokIntersectionOffset,
  type OmokBoardFrame,
} from "../../../lib/omok-geometry";
import type { OmokAim } from "../../../lib/omok-move-machine";
import type { OmokCell, OmokSlot } from "../../../lib/omok-contract";
import { omokTokens, radii } from "../../../theme/tokens";
import { BarePressable } from "../../ui";

const STAR_POINTS = [
  { row: 3, column: 3 },
  { row: 3, column: 11 },
  { row: 7, column: 7 },
  { row: 11, column: 3 },
  { row: 11, column: 11 },
];

type OmokGridProps = {
  board: OmokCell[];
  frame: OmokBoardFrame;
  aim: OmokAim | null;
  pendingStone: { position: OmokAim; slot: OmokSlot } | null;
  lastMove: { row: number; column: number } | null;
  enabled: boolean;
  onAim: (position: OmokAim) => void;
};

/**
 * One continuous touch surface rather than 225 separate targets. A tap resolves
 * to the nearest intersection, which keeps every point on a 360dp-wide board
 * reachable without overlapping 44dp hit areas that would make neighbouring
 * intersections ambiguous.
 */
export function OmokGrid({
  board,
  frame,
  aim,
  pendingStone,
  lastMove,
  enabled,
  onAim,
}: OmokGridProps) {
  const lines = Array.from({ length: OMOK_BOARD_SIZE }, (_, index) => index);
  const handlePress = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    onAim(nearestOmokIntersection({ x: locationX, y: locationY }, frame));
  };

  return (
    <BarePressable
      accessibilityRole="button"
      accessibilityLabel="오목판. 두고 싶은 자리를 누르면 표시되고, 아래에서 확인할 수 있어요."
      accessibilityState={{ disabled: !enabled }}
      accessibilityHint={
        aim ? `현재 선택한 자리 ${omokCoordinateLabel(aim)}` : undefined
      }
      disabled={!enabled}
      onPress={handlePress}
      style={[styles.board, { width: frame.boardEdge, height: frame.boardEdge }]}
    >
      {lines.map((index) => {
        const offset = omokIntersectionOffset(index, frame);
        const span = frame.boardEdge - frame.padding * 2;
        return (
          <View key={`line-${index}`} pointerEvents="none">
            <View
              style={[
                styles.lineHorizontal,
                { top: offset, left: frame.padding, width: span },
              ]}
            />
            <View
              style={[
                styles.lineVertical,
                { left: offset, top: frame.padding, height: span },
              ]}
            />
          </View>
        );
      })}

      {STAR_POINTS.map((point) => (
        <View
          key={`star-${point.row}-${point.column}`}
          pointerEvents="none"
          style={[
            styles.star,
            {
              width: omokTokens.starSize * 2,
              height: omokTokens.starSize * 2,
              top: omokIntersectionOffset(point.row, frame) - omokTokens.starSize,
              left: omokIntersectionOffset(point.column, frame) - omokTokens.starSize,
            },
          ]}
        />
      ))}

      {aim ? (
        <View
          pointerEvents="none"
          style={[
            styles.aim,
            {
              width: frame.stoneSize,
              height: frame.stoneSize,
              top: omokIntersectionOffset(aim.row, frame) - frame.stoneSize / 2,
              left: omokIntersectionOffset(aim.column, frame) - frame.stoneSize / 2,
            },
          ]}
        />
      ) : null}

      {board.map((cell, index) => {
        if (!cell) return null;
        const row = Math.floor(index / OMOK_BOARD_SIZE);
        const column = index % OMOK_BOARD_SIZE;
        const isPending =
          pendingStone?.position.row === row && pendingStone.position.column === column;
        const isLast = !isPending && lastMove?.row === row && lastMove.column === column;
        return (
          <View
            key={`stone-${index}`}
            pointerEvents="none"
            style={[
              styles.stone,
              cell === "first" ? styles.blackStone : styles.whiteStone,
              isPending ? styles.pendingStone : null,
              {
                width: frame.stoneSize,
                height: frame.stoneSize,
                top: omokIntersectionOffset(row, frame) - frame.stoneSize / 2,
                left: omokIntersectionOffset(column, frame) - frame.stoneSize / 2,
              },
            ]}
          >
            {isLast ? <View style={styles.lastMoveDot} /> : null}
          </View>
        );
      })}
    </BarePressable>
  );
}

const styles = StyleSheet.create({
  board: {
    position: "relative",
    borderWidth: omokTokens.boardBorderWidth,
    borderColor: omokTokens.boardBorder,
    borderRadius: radii.control,
    backgroundColor: omokTokens.boardWood,
    alignSelf: "center",
  },
  lineHorizontal: {
    position: "absolute",
    height: StyleSheet.hairlineWidth,
    backgroundColor: omokTokens.boardGrid,
  },
  lineVertical: {
    position: "absolute",
    width: StyleSheet.hairlineWidth,
    backgroundColor: omokTokens.boardGrid,
  },
  star: {
    position: "absolute",
    borderRadius: radii.pill,
    backgroundColor: omokTokens.star,
  },
  aim: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: omokTokens.aimRingWidth,
    borderColor: omokTokens.aimRing,
    backgroundColor: omokTokens.aimFill,
  },
  stone: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  blackStone: {
    backgroundColor: omokTokens.blackStone,
    borderColor: omokTokens.blackStoneBorder,
  },
  whiteStone: {
    backgroundColor: omokTokens.whiteStone,
    borderWidth: omokTokens.whiteStoneBorderWidth,
    borderColor: omokTokens.whiteStoneBorder,
  },
  /** Distinct by transparency and a ring, not by colour alone. */
  pendingStone: {
    opacity: omokTokens.pendingOpacity,
    borderWidth: omokTokens.pendingRingWidth,
    borderColor: omokTokens.pendingRing,
    borderStyle: "dashed",
  },
  lastMoveDot: {
    width: omokTokens.lastMoveDotSize,
    height: omokTokens.lastMoveDotSize,
    borderRadius: radii.pill,
    backgroundColor: omokTokens.lastMove,
  },
});
