import { describe, expect, it } from "vitest";
import {
  OMOK_BOARD_SIZE,
  nearestOmokIntersection,
  omokBoardFrame,
  omokCoordinateLabel,
  omokIntersectionOffset,
} from "./omok-geometry";

/** A20-class 720x1560 physical => 360x780 logical, S23 1080x2340 => ~393x851. */
const devices = [
  { name: "A20 720x1560", width: 360, height: 780 },
  { name: "S23 1080x2340", width: 393, height: 851 },
];

const chrome = { reservedHeight: 260, horizontalPadding: 16, maxEdge: 520, minEdge: 240 };

describe("omok board geometry", () => {
  it.each(devices)("fits $name without scrolling on either axis", ({ width, height }) => {
    const frame = omokBoardFrame({ width, height, ...chrome });
    expect(frame.boardEdge).toBeLessThanOrEqual(width - chrome.horizontalPadding * 2);
    expect(frame.boardEdge).toBeLessThanOrEqual(height - chrome.reservedHeight);
    expect(frame.boardEdge).toBeGreaterThan(0);
    // The outermost intersection plus half a stone stays inside the surface.
    const last = omokIntersectionOffset(OMOK_BOARD_SIZE - 1, frame);
    expect(last + frame.stoneSize / 2).toBeLessThanOrEqual(frame.boardEdge);
    expect(omokIntersectionOffset(0, frame) - frame.stoneSize / 2).toBeGreaterThanOrEqual(0);
  });

  it("uses the shorter axis when vertical space is the constraint", () => {
    // 520 - 260 reserved = 260 of vertical room, below the 361 available width.
    const frame = omokBoardFrame({ width: 393, height: 520, ...chrome });
    expect(frame.boardEdge).toBe(260);

    // The floor still wins on a very short viewport, and the caller scrolls
    // nothing because reservedHeight already excluded the chrome.
    const tiny = omokBoardFrame({ width: 393, height: 400, ...chrome });
    expect(tiny.boardEdge).toBe(chrome.minEdge);
  });

  it("snaps a touch anywhere on the surface to the nearest intersection", () => {
    const frame = omokBoardFrame({ width: 360, height: 780, ...chrome });
    for (const [row, column] of [[0, 0], [7, 7], [14, 14], [3, 11]] as const) {
      const point = {
        x: omokIntersectionOffset(column, frame),
        y: omokIntersectionOffset(row, frame),
      };
      expect(nearestOmokIntersection(point, frame)).toEqual({ row, column });
      // A touch offset by a third of a cell still resolves to the same target,
      // which is what makes the continuous surface usable at 360dp.
      expect(
        nearestOmokIntersection(
          { x: point.x + frame.cellSize / 3, y: point.y - frame.cellSize / 3 },
          frame,
        ),
      ).toEqual({ row, column });
    }
  });

  it("clamps touches outside the grid to the board edge", () => {
    const frame = omokBoardFrame({ width: 360, height: 780, ...chrome });
    expect(nearestOmokIntersection({ x: -500, y: -500 }, frame)).toEqual({ row: 0, column: 0 });
    expect(nearestOmokIntersection({ x: 5_000, y: 5_000 }, frame)).toEqual({ row: 14, column: 14 });
  });

  it("announces a one-based coordinate", () => {
    expect(omokCoordinateLabel({ row: 6, column: 8 })).toBe("7행 9열");
  });
});
