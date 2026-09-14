/** Wire-only contract: safe for root contract tests to import without native UI. */
export type GameParticipantPetData = {
  color: string;
  growthStage: 1 | 2 | 3;
  equippedItemKeys?: readonly string[];
  hiddenItemKeys?: readonly string[];
};

export const GAME_PET_SIZES = { compact: 56, player: 64, emphasis: 96 } as const;
export type GameParticipantPetSize = 40 | 44 | 48 | 56 | 64 | 96;

export type PetSceneRect = { left: number; top: number; width: number; height: number };

export function containPetScene(rectangles: readonly PetSceneRect[], size: GameParticipantPetSize) {
  const left = Math.min(0, ...rectangles.map((rect) => rect.left));
  const top = Math.min(0, ...rectangles.map((rect) => rect.top));
  const right = Math.max(1, ...rectangles.map((rect) => rect.left + rect.width));
  const bottom = Math.max(1, ...rectangles.map((rect) => rect.top + rect.height));
  const width = right - left;
  const height = bottom - top;
  const padding = size / 12;
  const scale = (size - padding * 2) / Math.max(width, height);
  return { left, top, width, height, scale };
}
