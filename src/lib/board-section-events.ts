import { sortSections } from "@/lib/sort-sections";

export const BOARD_SECTIONS_REORDERED_EVENT = "aura-board:sections-reordered";
export const BOARD_SECTIONS_UPDATED_EVENT = "aura-board:sections-updated";

export type BoardSectionSnapshot = {
  id: string;
  title: string;
  accessToken: string | null;
  order: number;
  pinned: boolean;
};

export type BoardSectionsUpdatedMode = "snapshot" | "positions";

export type BoardSectionsReorderedDetail = {
  boardId: string;
  sections: Array<{
    id: string;
    order: number;
    pinned: boolean;
  }>;
};

export type BoardSectionsUpdatedDetail = {
  boardId: string;
  sections: BoardSectionSnapshot[];
  /** Position-only updates must not overwrite newer title/access-token metadata. */
  mode?: BoardSectionsUpdatedMode;
};

/**
 * Merges a position-only event into the latest section snapshot without
 * replacing metadata that may have changed through another local or realtime
 * operation while the reorder request was in flight.
 */
export function mergeBoardSectionPositions<
  T extends { id: string; order?: number; pinned?: boolean },
>(
  sections: readonly T[],
  positions: readonly Pick<BoardSectionSnapshot, "id" | "order" | "pinned">[],
): T[] {
  const positionById = new Map(
    positions.map((position) => [position.id, position] as const),
  );

  return sections
    .map((section): T => {
      const position = positionById.get(section.id);
      return position
        ? {
            ...section,
            order: position.order,
            pinned: position.pinned,
          }
        : section;
    })
    .sort((a, b) =>
      sortSections(
        { order: a.order ?? 0, pinned: a.pinned ?? false },
        { order: b.order ?? 0, pinned: b.pinned ?? false },
      ),
    );
}
