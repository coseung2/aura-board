/** Board geometry for the active Omok surface.
 *
 * A 15x15 grid cannot give every intersection a 44dp target on a 360dp-wide
 * phone (15 * 44 = 660dp), so the board uses a continuous touch surface: a tap
 * snaps to the nearest intersection and separate >=44dp confirm/cancel controls
 * carry the accessible targets. Geometry is therefore derived from the space
 * actually available rather than a fixed cell size, and never scrolls.
 */
export const OMOK_BOARD_SIZE = 15;

export type OmokBoardFrame = {
  /** Outer square edge, including the padding ring around the grid. */
  boardEdge: number;
  /** Distance between two adjacent intersections. */
  cellSize: number;
  /** Padding ring so edge intersections and stones stay inside the board. */
  padding: number;
  /** Rendered stone diameter. */
  stoneSize: number;
};

export type OmokBoardFrameInput = {
  width: number;
  height: number;
  /** Chrome consumed by HUD, turn bar, and action row on the same screen. */
  reservedHeight: number;
  /** Horizontal page padding applied on both sides. */
  horizontalPadding: number;
  maxEdge: number;
  minEdge: number;
};

/** Fit the largest square board that needs no scrolling on either axis. */
export function omokBoardFrame({
  width,
  height,
  reservedHeight,
  horizontalPadding,
  maxEdge,
  minEdge,
}: OmokBoardFrameInput): OmokBoardFrame {
  const availableWidth = Math.max(0, width - horizontalPadding * 2);
  const availableHeight = Math.max(0, height - reservedHeight);
  const bounded = Math.min(availableWidth, availableHeight, maxEdge);
  const boardEdge = Math.max(minEdge, Math.floor(bounded));
  // One half-cell ring keeps the outermost intersections and their stones
  // fully inside the board surface.
  const cellSize = boardEdge / OMOK_BOARD_SIZE;
  return {
    boardEdge,
    cellSize,
    padding: cellSize / 2,
    stoneSize: Math.floor(cellSize * 0.86),
  };
}

/** Grid coordinate of an intersection centre inside the board surface. */
export function omokIntersectionOffset(index: number, frame: OmokBoardFrame): number {
  return frame.padding + index * frame.cellSize;
}

/** Nearest intersection to a local touch point on the continuous surface. */
export function nearestOmokIntersection(
  point: { x: number; y: number },
  frame: OmokBoardFrame,
): { row: number; column: number } {
  const clamp = (value: number) =>
    Math.min(
      OMOK_BOARD_SIZE - 1,
      Math.max(0, Math.round((value - frame.padding) / frame.cellSize)),
    );
  return { row: clamp(point.y), column: clamp(point.x) };
}

/** Human-readable coordinate for screen-reader announcements. */
export function omokCoordinateLabel(position: { row: number; column: number }): string {
  return `${position.row + 1}행 ${position.column + 1}열`;
}
