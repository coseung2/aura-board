import type { OmokCell, OmokPosition, OmokSlot } from "./contracts";

export const OMOK_BOT_ACTOR_SUBJECT = "bot:omok:v1";
export const OMOK_BOT_DISPLAY_NAME = "오목봇";

const BOARD_SIZE = 15;
const CENTER = Math.floor(BOARD_SIZE / 2);
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

function otherSlot(slot: OmokSlot): OmokSlot {
  return slot === "first" ? "second" : "first";
}

function cellAt(board: readonly OmokCell[], row: number, column: number): OmokCell | undefined {
  if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) return undefined;
  return board[row * BOARD_SIZE + column];
}

function countLine(
  board: readonly OmokCell[],
  row: number,
  column: number,
  rowStep: number,
  columnStep: number,
  slot: OmokSlot,
): number {
  let count = 0;
  let nextRow = row + rowStep;
  let nextColumn = column + columnStep;
  while (cellAt(board, nextRow, nextColumn) === slot) {
    count += 1;
    nextRow += rowStep;
    nextColumn += columnStep;
  }
  return count;
}

function lineProfile(
  board: readonly OmokCell[],
  row: number,
  column: number,
  rowStep: number,
  columnStep: number,
  slot: OmokSlot,
): { stones: number; openEnds: number } {
  const forward = countLine(board, row, column, rowStep, columnStep, slot);
  const backward = countLine(board, row, column, -rowStep, -columnStep, slot);
  const forwardCell = cellAt(
    board,
    row + rowStep * (forward + 1),
    column + columnStep * (forward + 1),
  );
  const backwardCell = cellAt(
    board,
    row - rowStep * (backward + 1),
    column - columnStep * (backward + 1),
  );
  return {
    stones: 1 + forward + backward,
    openEnds: Number(forwardCell === null) + Number(backwardCell === null),
  };
}

function isWinningPlacement(
  board: readonly OmokCell[],
  row: number,
  column: number,
  slot: OmokSlot,
): boolean {
  if (cellAt(board, row, column) !== null) return false;
  return DIRECTIONS.some(([rowStep, columnStep]) => {
    const profile = lineProfile(board, row, column, rowStep, columnStep, slot);
    return profile.stones >= 5;
  });
}

function lineScore(stones: number, openEnds: number): number {
  if (stones >= 5) return 1_000_000;
  if (stones === 4) return openEnds === 2 ? 120_000 : openEnds === 1 ? 45_000 : 0;
  if (stones === 3) return openEnds === 2 ? 18_000 : openEnds === 1 ? 4_000 : 0;
  if (stones === 2) return openEnds === 2 ? 2_000 : openEnds === 1 ? 450 : 0;
  return openEnds === 2 ? 90 : openEnds === 1 ? 25 : 0;
}

function localDensity(board: readonly OmokCell[], row: number, column: number): number {
  let score = 0;
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const cell = cellAt(board, row + rowOffset, column + columnOffset);
      if (!cell) continue;
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
      score += distance === 1 ? 18 : 5;
    }
  }
  return score;
}

function placementScore(
  board: readonly OmokCell[],
  row: number,
  column: number,
  botSlot: OmokSlot,
): number {
  if (cellAt(board, row, column) !== null) return Number.NEGATIVE_INFINITY;

  const opponent = otherSlot(botSlot);
  if (isWinningPlacement(board, row, column, botSlot)) return 2_000_000_000;
  if (isWinningPlacement(board, row, column, opponent)) return 1_500_000_000;

  let score = localDensity(board, row, column);
  for (const [rowStep, columnStep] of DIRECTIONS) {
    const attack = lineProfile(board, row, column, rowStep, columnStep, botSlot);
    const defense = lineProfile(board, row, column, rowStep, columnStep, opponent);
    score += lineScore(attack.stones, attack.openEnds) * 2;
    score += Math.floor(lineScore(defense.stones, defense.openEnds) * 1.6);
  }

  const centerDistance = Math.abs(row - CENTER) + Math.abs(column - CENTER);
  score += Math.max(0, BOARD_SIZE - centerDistance) * 3;
  return score;
}

function candidatePositions(board: readonly OmokCell[]): OmokPosition[] {
  const occupied: OmokPosition[] = [];
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === null) continue;
    occupied.push({ row: Math.floor(index / BOARD_SIZE), column: index % BOARD_SIZE });
  }

  if (occupied.length === 0) return [{ row: CENTER, column: CENTER }];

  const candidates = new Map<string, OmokPosition>();
  for (const stone of occupied) {
    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
        const row = stone.row + rowOffset;
        const column = stone.column + columnOffset;
        if (cellAt(board, row, column) !== null) continue;
        candidates.set(`${row}:${column}`, { row, column });
      }
    }
  }
  return [...candidates.values()];
}

/**
 * Deterministic local Omok opponent. The Rust play engine still validates and
 * commits every chosen move; this module only ranks legal-looking candidates.
 */
export function chooseOmokBotMove(
  board: readonly OmokCell[],
  botSlot: OmokSlot,
): OmokPosition | null {
  if (board.length !== BOARD_SIZE * BOARD_SIZE) return null;
  const candidates = candidatePositions(board);
  if (candidates.length === 0) return null;

  let best: OmokPosition | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCenterDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = placementScore(board, candidate.row, candidate.column, botSlot);
    const centerDistance =
      (candidate.row - CENTER) ** 2 + (candidate.column - CENTER) ** 2;
    if (
      score > bestScore ||
      (score === bestScore && centerDistance < bestCenterDistance) ||
      (score === bestScore &&
        centerDistance === bestCenterDistance &&
        best !== null &&
        (candidate.row < best.row ||
          (candidate.row === best.row && candidate.column < best.column)))
    ) {
      best = candidate;
      bestScore = score;
      bestCenterDistance = centerDistance;
    }
  }
  return best;
}
