import { describe, expect, it } from "vitest";
import type { OmokCell } from "./contracts";
import { chooseOmokBotMove } from "./omok-bot";

function emptyBoard(): OmokCell[] {
  return Array<OmokCell>(15 * 15).fill(null);
}

function setStone(board: OmokCell[], row: number, column: number, slot: "first" | "second") {
  board[row * 15 + column] = slot;
}

describe("chooseOmokBotMove", () => {
  it("opens at the center on an empty board", () => {
    expect(chooseOmokBotMove(emptyBoard(), "second")).toEqual({ row: 7, column: 7 });
  });

  it("takes an immediate five-in-a-row win", () => {
    const board = emptyBoard();
    for (const column of [4, 5, 6, 7]) setStone(board, 7, column, "second");
    setStone(board, 6, 6, "first");

    expect(chooseOmokBotMove(board, "second")).toEqual({ row: 7, column: 8 });
  });

  it("blocks the opponent's immediate five-in-a-row", () => {
    const board = emptyBoard();
    for (const column of [4, 5, 6, 7]) setStone(board, 9, column, "first");
    setStone(board, 8, 6, "second");

    expect(chooseOmokBotMove(board, "second")).toEqual({ row: 9, column: 8 });
  });

  it("always returns an empty candidate when moves remain", () => {
    const board = emptyBoard();
    setStone(board, 7, 7, "first");
    setStone(board, 7, 8, "second");
    const move = chooseOmokBotMove(board, "second");

    expect(move).not.toBeNull();
    expect(board[(move?.row ?? 0) * 15 + (move?.column ?? 0)]).toBeNull();
  });
});
